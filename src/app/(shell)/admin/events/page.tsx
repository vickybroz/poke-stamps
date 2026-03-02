"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import { loadImageLibrary } from "../_lib/images";
import type {
  AdminEventOverviewRow,
  CollectionItem,
  EventItem,
  ImageOption,
} from "../_lib/types";

type EventFormState = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  description: string;
  image_url: string;
  collection_ids: string[];
};

export default function AdminEventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useAdminAccess();
  const [eventRows, setEventRows] = useState<AdminEventOverviewRow[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [openGallery, setOpenGallery] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>({
    id: "",
    name: "",
    starts_at: "",
    ends_at: "",
    description: "",
    image_url: "",
    collection_ids: [],
  });

  const queryId = searchParams.get("id");
  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const [{ data: overviewRows, error: overviewError }, { data: collectionRows }, imageResult] =
      await Promise.all([
        supabase.rpc("admin_get_events_overview"),
        supabase
          .from("collections")
          .select("id, name, description, image_url")
          .order("created_at", { ascending: false }),
        loadImageLibrary(),
      ]);

    if (overviewError) {
      setFeedback(overviewError.message);
      return;
    }

    const rows = (overviewRows as AdminEventOverviewRow[] | null) ?? [];
    setEventRows(rows);
    setEvents(
      Array.from(
        rows.reduce((map, row) => {
          if (!map.has(row.event_id)) {
            map.set(row.event_id, {
              id: row.event_id,
              name: row.event_name,
              starts_at: row.event_starts_at,
              ends_at: row.event_ends_at,
              description: row.event_description,
              image_url: row.event_image_url,
            });
          }
          return map;
        }, new Map<string, EventItem>()),
      ).map(([, event]) => event),
    );
    setCollections((collectionRows as CollectionItem[] | null) ?? []);
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
      setExpandedEventId(queryId);
    }
  }, [queryId]);

  const getEventCollectionIds = (eventId: string) =>
    eventRows
      .filter((row) => row.event_id === eventId && row.collection_id)
      .map((row) => row.collection_id as string);

  const filteredEvents = useMemo(() => {
    return events.filter((eventItem) => {
      if (queryId) {
        return eventItem.id === queryId;
      }

      if (!activeSearch) return true;

      return [eventItem.name, eventItem.description ?? "", eventItem.starts_at, eventItem.ends_at ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch);
    });
  }, [activeSearch, events, queryId]);

  const resetForm = () => {
    setEventForm({
      id: "",
      name: "",
      starts_at: "",
      ends_at: "",
      description: "",
      image_url: "",
      collection_ids: [],
    });
    setOpenGallery(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const syncEventCollections = async (eventId: string, collectionIds: string[]) => {
    const uniqueCollectionIds = Array.from(new Set(collectionIds.filter(Boolean)));

    const { error: deleteError } = await supabase
      .from("event_collections")
      .delete()
      .eq("event_id", eventId);

    if (deleteError) throw deleteError;

    if (!userId || !uniqueCollectionIds.length) return;

    const { error: insertError } = await supabase.from("event_collections").insert(
      uniqueCollectionIds.map((collectionId) => ({
        event_id: eventId,
        collection_id: collectionId,
        created_by: userId,
      })),
    );

    if (insertError) throw insertError;
  };

  const handleSave = async () => {
    if (!userId || !eventForm.name.trim() || !eventForm.starts_at) {
      setFeedback("Completa nombre y fecha de inicio.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: eventForm.name.trim(),
        starts_at: eventForm.starts_at,
        ends_at: eventForm.ends_at || null,
        description: eventForm.description || null,
        image_url: eventForm.image_url || null,
        created_by: userId,
      };

      let eventId = eventForm.id;

      if (eventForm.id) {
        const { error } = await supabase.from("events").update(payload).eq("id", eventForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("events").insert(payload).select("id").single();
        if (error) throw error;
        eventId = data.id;
      }

      await syncEventCollections(eventId, eventForm.collection_ids);
      await loadPageData();
      setFeedback(eventForm.id ? "Evento actualizado." : "Evento creado.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo guardar el evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("events").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await loadPageData();
      setFeedback("Evento eliminado.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (eventItem: EventItem) => {
    setEventForm({
      id: eventItem.id,
      name: eventItem.name,
      starts_at: eventItem.starts_at,
      ends_at: eventItem.ends_at ?? "",
      description: eventItem.description ?? "",
      image_url: eventItem.image_url ?? "",
      collection_ids: getEventCollectionIds(eventItem.id),
    });
    setIsModalOpen(true);
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Eventos</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en eventos"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="admin-mini-btn admin-mini-btn-primary" onClick={openCreate}>
          Nuevo
        </button>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-list">
        {filteredEvents.map((eventItem) => {
          const hasCollections = getEventCollectionIds(eventItem.id).length > 0;
          const relatedCollections = eventRows
            .filter((row) => row.event_id === eventItem.id && row.collection_id && row.collection_name)
            .map((row) => ({
              id: row.collection_id as string,
              name: row.collection_name as string,
            }));

          return (
            <li key={eventItem.id} className="admin-item">
              <div className="admin-item-header">
                <button
                  type="button"
                  className="admin-select"
                  onClick={() =>
                    setExpandedEventId((current) => (current === eventItem.id ? null : eventItem.id))
                  }
                >
                  {eventItem.image_url ? (
                    <img
                      src={eventItem.image_url}
                      alt={eventItem.name}
                      className="admin-inline-thumb"
                    />
                  ) : null}
                  <span
                    className={`admin-status-dot ${hasCollections ? "enabled" : "disabled"}`}
                    aria-hidden="true"
                  />
                  <span className="admin-item-name">{eventItem.name}</span>
                  <span className="admin-date-chip">
                    {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fin"}
                  </span>
                </button>
                <div className="admin-hover-actions">
                  <button
                    type="button"
                    className="admin-action-btn admin-action-btn-edit"
                    aria-label={`Editar ${eventItem.name}`}
                    onClick={() => openEdit(eventItem)}
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
                    aria-label={`Borrar ${eventItem.name}`}
                    onClick={() => setDeleteTarget({ id: eventItem.id, name: eventItem.name })}
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
              {expandedEventId === eventItem.id ? (
                <div className="admin-expanded">
                  {eventItem.description ? (
                    <p className="admin-muted admin-muted-small">{eventItem.description}</p>
                  ) : null}
                  <p className="admin-muted admin-muted-small">
                    {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fecha de fin"}
                  </p>
                  <div className="admin-event-collections">
                    {relatedCollections.length ? (
                      <ul className="admin-inline-list">
                        {relatedCollections.map((collectionItem) => (
                          <li key={collectionItem.id} className="admin-inline-list-item">
                            <button
                              type="button"
                              className="admin-inline-link"
                              onClick={() =>
                                router.push(
                                  `/admin/collections?id=${collectionItem.id}&eventId=${eventItem.id}`,
                                )
                              }
                            >
                              {collectionItem.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="admin-muted admin-muted-small">No tiene colecciones asignadas.</p>
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
              <button
                type="button"
                className="admin-icon-close"
                onClick={closeModal}
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
            <div className="admin-form">
              <input
                className="auth-input"
                placeholder="Nombre del evento"
                value={eventForm.name}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                type="date"
                value={eventForm.starts_at}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, starts_at: event.target.value }))
                }
              />
              <input
                className="auth-input"
                type="date"
                value={eventForm.ends_at}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, ends_at: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Descripcion"
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />

              <div className="admin-image-picker">
                {eventForm.image_url ? (
                  <div className="admin-selected-image">
                    <img
                      src={eventForm.image_url}
                      alt="Imagen seleccionada"
                      className="admin-selected-thumb"
                    />
                    <button
                      type="button"
                      className="admin-mini-btn danger"
                      onClick={() => setEventForm((prev) => ({ ...prev, image_url: "" }))}
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

              <div className="admin-relation-picker">
                <p className="admin-muted admin-muted-small">Colecciones del evento</p>
                <div className="admin-check-list">
                  {collections.map((collectionItem) => (
                    <label key={collectionItem.id} className="admin-check-item">
                      <input
                        type="checkbox"
                        checked={eventForm.collection_ids.includes(collectionItem.id)}
                        onChange={(event) =>
                          setEventForm((prev) => ({
                            ...prev,
                            collection_ids: event.target.checked
                              ? [...prev.collection_ids, collectionItem.id]
                              : prev.collection_ids.filter((id) => id !== collectionItem.id),
                          }))
                        }
                      />
                      <span>{collectionItem.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Guardando..." : eventForm.id ? "Guardar cambios" : "Crear evento"}
              </button>
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
                    setEventForm((prev) => ({ ...prev, image_url: image.url }));
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

