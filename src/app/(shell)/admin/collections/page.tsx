"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import { loadImageLibrary } from "../_lib/images";
import type {
  AdminCollectionOverviewRow,
  CollectionItem,
  EventItem,
  ImageOption,
  StampItem,
} from "../_lib/types";

type CollectionFormState = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  event_ids: string[];
  stamp_ids: string[];
};

export default function AdminCollectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useAdminAccess();
  const [collectionRows, setCollectionRows] = useState<AdminCollectionOverviewRow[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openGallery, setOpenGallery] = useState(false);
  const [isStampPickerOpen, setIsStampPickerOpen] = useState(false);
  const [stampPickerSearch, setStampPickerSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [collectionForm, setCollectionForm] = useState<CollectionFormState>({
    id: "",
    name: "",
    description: "",
    image_url: "",
    event_ids: [],
    stamp_ids: [],
  });

  const queryId = searchParams.get("id");
  const queryEventId = searchParams.get("eventId");
  const activeSearch = getActiveSearchTerm(search);
  const activeStampPickerSearch = getActiveSearchTerm(stampPickerSearch);

  const loadPageData = async () => {
    const [
      { data: overviewRows, error: overviewError },
      { data: eventRows },
      { data: stampRows },
      imageResult,
    ] = await Promise.all([
      supabase.rpc("admin_get_collections_overview"),
      supabase
        .from("events")
        .select("id, name, starts_at, ends_at, description, image_url")
        .order("created_at", { ascending: false }),
      supabase
        .from("stamps")
        .select("id, name, description, image_url")
        .order("created_at", { ascending: false }),
      loadImageLibrary(),
    ]);

    if (overviewError) {
      setFeedback(overviewError.message);
      return;
    }

    const rows = (overviewRows as AdminCollectionOverviewRow[] | null) ?? [];
    setCollectionRows(rows);
    setCollections(
      Array.from(
        rows.reduce((map, row) => {
          if (!map.has(row.collection_id)) {
            map.set(row.collection_id, {
              id: row.collection_id,
              name: row.collection_name,
              description: row.collection_description,
              image_url: row.collection_image_url,
            });
          }
          return map;
        }, new Map<string, CollectionItem>()),
      ).map(([, collection]) => collection),
    );
    setEvents((eventRows as EventItem[] | null) ?? []);
    setStamps((stampRows as StampItem[] | null) ?? []);
    setImageOptions(imageResult.images);
    if (imageResult.error) {
      setFeedback(imageResult.error);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    if (queryId) {
      setExpandedCollectionId(queryId);
    }
  }, [queryId]);

  const getCollectionEventIds = (collectionId: string) =>
    collectionRows
      .filter((row) => row.collection_id === collectionId && row.event_id)
      .map((row) => row.event_id as string);

  const getCollectionStampIds = (collectionId: string) =>
    collectionRows
      .filter((row) => row.collection_id === collectionId && row.stamp_id)
      .map((row) => row.stamp_id as string);

  const filteredCollections = useMemo(() => {
    return collections.filter((collectionItem) => {
      const relatedEventIds = collectionRows
        .filter((row) => row.collection_id === collectionItem.id && row.event_id)
        .map((row) => row.event_id as string);

      if (queryId) {
        return collectionItem.id === queryId;
      }

      if (queryEventId && !relatedEventIds.includes(queryEventId)) {
        return false;
      }

      if (!activeSearch) return true;

      const eventNames = relatedEventIds
        .map((eventId) => events.find((eventItem) => eventItem.id === eventId)?.name ?? "")
        .join(" ");

      return [collectionItem.name, collectionItem.description ?? "", eventNames]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch);
    });
  }, [activeSearch, collections, collectionRows, events, queryEventId, queryId]);

  const resetForm = () => {
    setCollectionForm({
      id: "",
      name: "",
      description: "",
      image_url: "",
      event_ids: queryEventId ? [queryEventId] : [],
      stamp_ids: [],
    });
    setOpenGallery(false);
    setIsStampPickerOpen(false);
    setStampPickerSearch("");
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const syncCollectionRelations = async (collectionId: string, eventIds: string[], stampIds: string[]) => {
    const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
    const uniqueStampIds = Array.from(new Set(stampIds.filter(Boolean)));

    const { error: deleteEventLinksError } = await supabase
      .from("event_collections")
      .delete()
      .eq("collection_id", collectionId);
    if (deleteEventLinksError) throw deleteEventLinksError;

    const { error: deleteStampLinksError } = await supabase
      .from("collection_stamps")
      .delete()
      .eq("collection_id", collectionId);
    if (deleteStampLinksError) throw deleteStampLinksError;

    if (userId && uniqueEventIds.length) {
      const { error: insertEventLinksError } = await supabase.from("event_collections").insert(
        uniqueEventIds.map((eventId) => ({
          event_id: eventId,
          collection_id: collectionId,
          created_by: userId,
        })),
      );
      if (insertEventLinksError) throw insertEventLinksError;
    }

    if (userId && uniqueStampIds.length) {
      const { error: insertStampLinksError } = await supabase.from("collection_stamps").insert(
        uniqueStampIds.map((stampId) => ({
          collection_id: collectionId,
          stamp_id: stampId,
          created_by: userId,
        })),
      );
      if (insertStampLinksError) throw insertStampLinksError;
    }
  };

  const handleSave = async () => {
    if (!userId || !collectionForm.name.trim()) {
      setFeedback("Completa el nombre de la coleccion.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: collectionForm.name.trim(),
        description: collectionForm.description || null,
        image_url: collectionForm.image_url || null,
        created_by: userId,
      };

      let collectionId = collectionForm.id;
      if (collectionForm.id) {
        const { error } = await supabase.from("collections").update(payload).eq("id", collectionForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("collections")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        collectionId = data.id;
      }

      await syncCollectionRelations(collectionId, collectionForm.event_ids, collectionForm.stamp_ids);
      await loadPageData();
      setFeedback(collectionForm.id ? "Coleccion actualizada." : "Coleccion creada.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo guardar la coleccion.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("collections").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await loadPageData();
      setFeedback("Coleccion eliminada.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar la coleccion.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (collectionItem: CollectionItem) => {
    setCollectionForm({
      id: collectionItem.id,
      name: collectionItem.name,
      description: collectionItem.description ?? "",
      image_url: collectionItem.image_url ?? "",
      event_ids: getCollectionEventIds(collectionItem.id),
      stamp_ids: getCollectionStampIds(collectionItem.id),
    });
    setIsModalOpen(true);
  };

  const pickerStamps = stamps.filter((stampItem) => {
    if (!activeStampPickerSearch) return true;
    return [stampItem.name, stampItem.description ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(activeStampPickerSearch);
  });

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Colecciones</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en colecciones"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="admin-mini-btn admin-mini-btn-primary" onClick={openCreate}>
          Nuevo
        </button>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-list">
        {filteredCollections.map((collectionItem) => {
          const collectionStampIds = getCollectionStampIds(collectionItem.id);
          const relatedStamps = collectionRows
            .filter((row) => row.collection_id === collectionItem.id && row.stamp_id && row.stamp_name)
            .reduce(
              (map, row) => {
                if (!map.has(row.stamp_id as string)) {
                  map.set(row.stamp_id as string, {
                    id: row.stamp_id as string,
                    name: row.stamp_name as string,
                    description: row.stamp_description,
                    image_url: row.stamp_image_url,
                  });
                }
                return map;
              },
              new Map<string, StampItem>(),
            );
          const relatedEvents = collectionRows
            .filter((row) => row.collection_id === collectionItem.id && row.event_id && row.event_name)
            .reduce(
              (map, row) => {
                if (!map.has(row.event_id as string)) {
                  map.set(row.event_id as string, {
                    id: row.event_id as string,
                    name: row.event_name as string,
                  });
                }
                return map;
              },
              new Map<string, { id: string; name: string }>(),
            );

          return (
            <li key={collectionItem.id} className="admin-item">
              <div className="admin-item-header">
                <button
                  type="button"
                  className="admin-select"
                  onClick={() =>
                    setExpandedCollectionId((current) =>
                      current === collectionItem.id ? null : collectionItem.id,
                    )
                  }
                >
                  {collectionItem.image_url ? (
                    <img
                      src={collectionItem.image_url}
                      alt={collectionItem.name}
                      className="admin-inline-thumb"
                    />
                  ) : null}
                  <span
                    className={`admin-status-dot ${collectionStampIds.length ? "enabled" : "disabled"}`}
                    aria-hidden="true"
                  />
                  <span className="admin-item-name">{collectionItem.name}</span>
                </button>
                <div className="admin-hover-actions">
                  <button
                    type="button"
                    className="admin-action-btn admin-action-btn-edit"
                    aria-label={`Editar ${collectionItem.name}`}
                    onClick={() => openEdit(collectionItem)}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                      <path
                        d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="admin-action-btn admin-action-btn-delete"
                    aria-label={`Borrar ${collectionItem.name}`}
                    onClick={() => setDeleteTarget({ id: collectionItem.id, name: collectionItem.name })}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                      <path
                        d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              {expandedCollectionId === collectionItem.id ? (
                <div className="admin-expanded">
                  {collectionItem.description ? (
                    <p className="admin-muted admin-muted-small">{collectionItem.description}</p>
                  ) : null}
                  <div className="admin-expanded-stamps">
                    {Array.from(relatedStamps.values()).map((stampItem) => (
                        <div key={stampItem.id} className="admin-stamp-card">
                          {stampItem.image_url ? (
                            <img
                              src={stampItem.image_url}
                              alt={stampItem.name}
                              className="admin-stamp-thumb"
                            />
                          ) : (
                            <span className="admin-stamp-placeholder">Sin imagen</span>
                          )}
                          <span className="admin-item-name">{stampItem.name}</span>
                        </div>
                      ))}
                  </div>
                  <div className="admin-collection-events">
                    {relatedEvents.size ? (
                      Array.from(relatedEvents.values()).map((relatedEvent) => {
                        return (
                          <button
                            key={relatedEvent.id}
                            type="button"
                            className="admin-date-chip admin-date-chip-link"
                            onClick={() => router.push(`/admin/events?id=${relatedEvent.id}`)}
                          >
                            {relatedEvent.name}
                          </button>
                        );
                      })
                    ) : (
                      <p className="admin-muted admin-muted-small">Sin eventos</p>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isModalOpen ? (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div />
              <button type="button" className="admin-icon-close" onClick={closeModal} aria-label="Cerrar">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="admin-form">
              <div className="admin-image-picker">
                {collectionForm.image_url ? (
                  <div className="admin-selected-image">
                    <img
                      src={collectionForm.image_url}
                      alt="Imagen seleccionada"
                      className="admin-selected-thumb"
                    />
                    <button
                      type="button"
                      className="admin-mini-btn danger"
                      onClick={() => setCollectionForm((prev) => ({ ...prev, image_url: "" }))}
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <div className="admin-image-actions">
                    {imageOptions.length ? (
                      <button
                        type="button"
                        className="admin-icon-action"
                        aria-label="Elegir de galeria"
                        onClick={() => setOpenGallery((current) => !current)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                          <path
                            d="M9 4 7.17 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.17L15 4H9Zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-1.8a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    ) : (
                      <p className="admin-muted admin-muted-small">
                        No hay imagenes en el bucket para este tipo.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <input
                className="auth-input"
                placeholder="Nombre de coleccion"
                value={collectionForm.name}
                onChange={(event) =>
                  setCollectionForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Descripcion"
                value={collectionForm.description}
                onChange={(event) =>
                  setCollectionForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />

              <div className="admin-relation-picker">
                <div className="admin-relation-header">
                  <p className="admin-muted admin-muted-small">Stamps de la coleccion</p>
                  <button
                    type="button"
                    className="admin-mini-btn"
                    onClick={() => setIsStampPickerOpen(true)}
                  >
                    Agregar stamps
                  </button>
                </div>
                <div className="admin-stamp-select-grid">
                  {stamps
                    .filter((stampItem) => collectionForm.stamp_ids.includes(stampItem.id))
                    .map((stampItem) => (
                      <label key={stampItem.id} className="admin-stamp-select-card">
                        <input
                          type="checkbox"
                          checked={collectionForm.stamp_ids.includes(stampItem.id)}
                          onChange={(event) =>
                            setCollectionForm((prev) => ({
                              ...prev,
                              stamp_ids: event.target.checked
                                ? [...prev.stamp_ids, stampItem.id]
                                : prev.stamp_ids.filter((id) => id !== stampItem.id),
                            }))
                          }
                        />
                        {stampItem.image_url ? (
                          <img
                            src={stampItem.image_url}
                            alt={stampItem.name}
                            className="admin-stamp-select-thumb"
                          />
                        ) : (
                          <span className="admin-stamp-placeholder admin-stamp-select-thumb">
                            Sin imagen
                          </span>
                        )}
                        <span className="admin-stamp-select-name">{stampItem.name}</span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="admin-relation-picker">
                <p className="admin-muted admin-muted-small">Eventos donde aparece</p>
                <div className="admin-check-list">
                  {events.map((eventItem) => (
                    <label key={eventItem.id} className="admin-check-item">
                      <input
                        type="checkbox"
                        checked={collectionForm.event_ids.includes(eventItem.id)}
                        onChange={(event) =>
                          setCollectionForm((prev) => ({
                            ...prev,
                            event_ids: event.target.checked
                              ? [...prev.event_ids, eventItem.id]
                              : prev.event_ids.filter((id) => id !== eventItem.id),
                          }))
                        }
                      />
                      <span>{eventItem.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Guardando..." : collectionForm.id ? "Guardar cambios" : "Crear coleccion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStampPickerOpen ? (
        <div className="admin-modal-backdrop" onClick={() => setIsStampPickerOpen(false)}>
          <div className="admin-modal admin-modal-large" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Agregar stamps a la coleccion</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setIsStampPickerOpen(false)}
                aria-label="Cerrar"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <input
              type="search"
              className="admin-search-input admin-picker-search"
              placeholder="Buscar stamps"
              value={stampPickerSearch}
              onChange={(event) => setStampPickerSearch(event.target.value)}
            />
            <div className="admin-stamp-select-grid">
              {pickerStamps.length ? (
                pickerStamps.map((stampItem) => (
                  <label key={stampItem.id} className="admin-stamp-select-card">
                    <input
                      type="checkbox"
                      checked={collectionForm.stamp_ids.includes(stampItem.id)}
                      onChange={(event) =>
                        setCollectionForm((prev) => ({
                          ...prev,
                          stamp_ids: event.target.checked
                            ? [...prev.stamp_ids, stampItem.id]
                            : prev.stamp_ids.filter((id) => id !== stampItem.id),
                        }))
                      }
                    />
                    {stampItem.image_url ? (
                      <img
                        src={stampItem.image_url}
                        alt={stampItem.name}
                        className="admin-stamp-select-thumb"
                      />
                    ) : (
                      <span className="admin-stamp-placeholder admin-stamp-select-thumb">
                        Sin imagen
                      </span>
                    )}
                    <span className="admin-stamp-select-name">{stampItem.name}</span>
                  </label>
                ))
              ) : (
                <p className="admin-muted">No hay stamps que coincidan con la busqueda.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {openGallery ? (
        <div className="admin-modal-backdrop" onClick={() => setOpenGallery(false)}>
          <div className="admin-modal admin-modal-large" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div />
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setOpenGallery(false)}
                aria-label="Cerrar"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="admin-gallery-picker-grid">
              {imageOptions.map((image) => (
                <button
                  key={image.path}
                  type="button"
                  className="admin-gallery-picker-card"
                  onClick={() => {
                    setCollectionForm((prev) => ({ ...prev, image_url: image.url }));
                    setOpenGallery(false);
                  }}
                >
                  <img src={image.url} alt={image.label} className="admin-gallery-picker-thumb" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="admin-modal admin-modal-small"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Eliminar</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setDeleteTarget(null)}
                aria-label="Cerrar"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <p className="admin-muted">
              Seguro que quieres eliminar <strong>{deleteTarget.name}</strong>?
            </p>
            <button
              type="button"
              className="access-button danger"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

