"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import { loadImageLibrary } from "../_lib/images";
import type { AdminStampOverviewRow, ImageOption, StampClaimLookupResult, StampItem } from "../_lib/types";

type StampFormState = {
  id: string;
  name: string;
  description: string;
  image_url: string;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function normalizeClaimCode(rawValue: string) {
  const trimmed = rawValue.trim().toUpperCase();
  const match = trimmed.match(/PSA-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  return match?.[0] ?? trimmed;
}

function getStatusLabel(status: StampClaimLookupResult["delivered_to_status"]) {
  return status === "active"
    ? "Active"
    : status === "pending"
      ? "Pending"
      : status === "provisional"
        ? "Provisional"
        : "Inactive";
}

export default function AdminStampsPage() {
  const searchParams = useSearchParams();
  const { userId } = useAdminAccess();
  const [stampRows, setStampRows] = useState<AdminStampOverviewRow[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isIdentifyOpen, setIsIdentifyOpen] = useState(false);
  const [openGallery, setOpenGallery] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [claimCodeInput, setClaimCodeInput] = useState("");
  const [identifiedStamp, setIdentifiedStamp] = useState<StampClaimLookupResult | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [stampForm, setStampForm] = useState<StampFormState>({
    id: "",
    name: "",
    description: "",
    image_url: "",
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const queryId = searchParams.get("id");
  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const [{ data: overviewRows, error: overviewError }, imageResult] =
      await Promise.all([
        supabase.rpc("admin_get_stamps_overview"),
        loadImageLibrary(),
      ]);

    if (overviewError) {
      setFeedback(overviewError.message);
      return;
    }

    const rows = (overviewRows as AdminStampOverviewRow[] | null) ?? [];
    setStampRows(rows);
    setStamps(
      Array.from(
        rows.reduce((map, row) => {
          if (!map.has(row.stamp_id)) {
            map.set(row.stamp_id, {
              id: row.stamp_id,
              name: row.stamp_name,
              description: row.stamp_description,
              image_url: row.stamp_image_url,
            });
          }
          return map;
        }, new Map<string, StampItem>()),
      ).map(([, stamp]) => stamp),
    );
    setImageOptions(imageResult.images);
    if (imageResult.error) {
      setFeedback(imageResult.error);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const filteredStamps = useMemo(() => {
    return stamps.filter((stampItem) => {
      if (queryId) {
        return stampItem.id === queryId;
      }

      if (!activeSearch) return true;

      const collectionNames = stampRows
        .filter((row) => row.stamp_id === stampItem.id && row.collection_name)
        .map((row) => row.collection_name as string)
        .join(" ");

      return [stampItem.name, stampItem.description ?? "", collectionNames]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch);
    });
  }, [activeSearch, queryId, stampRows, stamps]);

  const resetForm = () => {
    setStampForm({
      id: "",
      name: "",
      description: "",
      image_url: "",
    });
    setOpenGallery(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const stopScanner = useCallback(() => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
  }, []);

  const resetIdentifyModal = useCallback(() => {
    setClaimCodeInput("");
    setIdentifiedStamp(null);
    setIdentifyError(null);
    setIsIdentifying(false);
    setScannerError(null);
    setIsScannerOpen(false);
    stopScanner();
  }, [stopScanner]);

  const closeIdentifyModal = useCallback(() => {
    setIsIdentifyOpen(false);
    resetIdentifyModal();
  }, [resetIdentifyModal]);

  const handleIdentifyStamp = useCallback(
    async (rawValue?: string) => {
      const normalizedClaimCode = normalizeClaimCode(rawValue ?? claimCodeInput);

      if (!normalizedClaimCode) {
        setIdentifyError("Ingresa un claim code valido.");
        setIdentifiedStamp(null);
        return;
      }

      setClaimCodeInput(normalizedClaimCode);
      setIsIdentifying(true);
      setIdentifyError(null);

      try {
        const { data, error } = await supabase.rpc("admin_identify_stamp", {
          p_claim_code: normalizedClaimCode,
        });

        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : null;

        if (!result) {
          setIdentifiedStamp(null);
          setIdentifyError("No existe una stamp entregada con ese claim code.");
          return;
        }

        setIdentifiedStamp(result as StampClaimLookupResult);
        setIdentifyError(null);
        setScannerError(null);
      } catch (error) {
        setIdentifiedStamp(null);
        setIdentifyError(error instanceof Error ? error.message : "No se pudo identificar la stamp.");
      } finally {
        setIsIdentifying(false);
      }
    },
    [claimCodeInput],
  );

  const handleSave = async () => {
    if (!userId || !stampForm.name.trim()) {
      setFeedback("Completa el nombre.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: stampForm.name.trim(),
        description: stampForm.description || null,
        image_url: stampForm.image_url || null,
        created_by: userId,
      };

      const { error } = stampForm.id
        ? await supabase.from("stamps").update(payload).eq("id", stampForm.id)
        : await supabase.from("stamps").insert(payload);

      if (error) throw error;

      await loadPageData();
      setFeedback(stampForm.id ? "Stamp actualizada." : "Stamp creada.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo guardar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("stamps").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await loadPageData();
      setFeedback("Stamp eliminada.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (stampItem: StampItem) => {
    setStampForm({
      id: stampItem.id,
      name: stampItem.name,
      description: stampItem.description ?? "",
      image_url: stampItem.image_url ?? "",
    });
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isIdentifyOpen) {
      stopScanner();
      setIsScannerOpen(false);
    }
  }, [isIdentifyOpen, stopScanner]);

  useEffect(() => {
    if (!isScannerOpen) {
      stopScanner();
      return;
    }

    const BarcodeDetectorApi = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    if (!BarcodeDetectorApi) {
      setScannerError("Este navegador no soporta escaneo QR.");
      setIsScannerOpen(false);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetectorApi({ formats: ["qr_code"] });

        scannerIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) return;

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results[0]?.rawValue;
            if (!rawValue) return;

            const normalizedClaimCode = normalizeClaimCode(rawValue);
            if (!normalizedClaimCode) {
              setScannerError("El QR no contiene un claim code valido.");
              return;
            }

            setClaimCodeInput(normalizedClaimCode);
            setIsScannerOpen(false);
            setScannerError(null);
            void handleIdentifyStamp(normalizedClaimCode);
          } catch {
            setScannerError("No se pudo leer el QR. Intenta acercar la camara.");
          }
        }, 500);
      } catch {
        setScannerError("No se pudo abrir la camara.");
        setIsScannerOpen(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [handleIdentifyStamp, isScannerOpen, stopScanner]);

  return (
    <article className="admin-box">
      <div className="admin-box-header admin-box-header-title">
        <h2 className="admin-subtitle admin-subtitle-no-margin">
          <span className="admin-users-status-head">
            <span>Stamps</span>
            <button
              type="button"
              className="admin-status-help-trigger"
              aria-label="Ver ayuda de stamps"
              onClick={() => setIsHelpOpen(true)}
            >
              ?
            </button>
          </span>
        </h2>
        <button
          type="button"
          className="admin-mini-btn admin-mini-btn-provisional"
          onClick={() => {
            resetIdentifyModal();
            setIsIdentifyOpen(true);
          }}
        >
          Identificar stamp
        </button>
      </div>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en stamps"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="admin-mini-btn admin-mini-btn-primary" onClick={openCreate}>
          Nuevo
        </button>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-stamps-grid">
        {filteredStamps.map((stampItem) => (
          <li key={stampItem.id} className="admin-stamp-item">
            <div className="admin-stamp-actions">
              <button
                type="button"
                className="admin-action-btn admin-action-btn-edit"
                aria-label={`Editar ${stampItem.name}`}
                onClick={() => openEdit(stampItem)}
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
                aria-label={`Borrar ${stampItem.name}`}
                onClick={() => setDeleteTarget({ id: stampItem.id, name: stampItem.name })}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="admin-stamp-card"
              onClick={() => openEdit(stampItem)}
            >
              {stampItem.image_url ? (
                <img src={stampItem.image_url} alt={stampItem.name} className="admin-stamp-thumb" />
              ) : (
                <span className="admin-stamp-placeholder">Sin imagen</span>
              )}
              <span className="admin-item-name">{stampItem.name}</span>
            </button>
          </li>
        ))}
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
              <input
                className="auth-input"
                placeholder="Nombre de stamp"
                value={stampForm.name}
                onChange={(event) =>
                  setStampForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Descripcion"
                value={stampForm.description}
                onChange={(event) =>
                  setStampForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <div className="admin-image-picker">
                {stampForm.image_url ? (
                  <div className="admin-selected-image">
                    <img
                      src={stampForm.image_url}
                      alt="Imagen seleccionada"
                      className="admin-selected-thumb"
                    />
                    <button
                      type="button"
                      className="admin-mini-btn danger"
                      onClick={() => setStampForm((prev) => ({ ...prev, image_url: "" }))}
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

              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Guardando..." : stampForm.id ? "Guardar cambios" : "Crear stamp"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isIdentifyOpen ? (
        <div className="admin-modal-backdrop" onClick={closeIdentifyModal}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Identificar stamp</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={closeIdentifyModal}
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
            <div className="admin-award-form">
              <div className="admin-inline-actions">
                <input
                  className="auth-input"
                  placeholder="Claim code"
                  value={claimCodeInput}
                  onChange={(event) => {
                    setClaimCodeInput(event.target.value.toUpperCase());
                    setIdentifyError(null);
                  }}
                />
                <button
                  type="button"
                  className="admin-mini-btn admin-mini-btn-provisional"
                  onClick={() => {
                    setScannerError(null);
                    setIsScannerOpen((current) => !current);
                  }}
                >
                  {isScannerOpen ? "Cerrar scanner" : "Escanear QR"}
                </button>
              </div>

              {isScannerOpen ? (
                <div className="admin-scanner-panel">
                  <video ref={videoRef} className="admin-scanner-video" muted playsInline />
                  {scannerError ? <p className="admin-error admin-error-small">{scannerError}</p> : null}
                </div>
              ) : null}

              <button
                type="button"
                className="access-button"
                onClick={() => void handleIdentifyStamp()}
                disabled={isIdentifying}
              >
                {isIdentifying ? "Buscando..." : "Identificar"}
              </button>

              {identifyError ? <p className="admin-error">{identifyError}</p> : null}

              {identifiedStamp ? (
                <div className="admin-claim-card">
                  <div className="admin-claim-card-head">
                    {identifiedStamp.stamp_image_url ? (
                      <img
                        src={identifiedStamp.stamp_image_url}
                        alt={identifiedStamp.stamp_name}
                        className="admin-claim-thumb"
                      />
                    ) : (
                      <div className="admin-stamp-placeholder admin-claim-thumb">Sin imagen</div>
                    )}
                    <div className="admin-claim-summary">
                      <strong>{identifiedStamp.stamp_name}</strong>
                      <span className="admin-muted">{identifiedStamp.claim_code}</span>
                      <span className="admin-muted">
                        {identifiedStamp.event_name} / {identifiedStamp.collection_name} / {identifiedStamp.stamp_name}
                      </span>
                    </div>
                  </div>

                  <div className="admin-claim-grid">
                    <div>
                      <span className="admin-claim-label">Entregada a</span>
                      <strong>{identifiedStamp.delivered_to_name?.trim() || "Trainer sin nombre"}</strong>
                      <span className="admin-muted">{identifiedStamp.delivered_to_code}</span>
                      <span className="admin-muted">
                        Status: {getStatusLabel(identifiedStamp.delivered_to_status)}
                      </span>
                    </div>
                    <div>
                      <span className="admin-claim-label">Entregada por</span>
                      <strong>{identifiedStamp.delivered_by_name?.trim() || "-"}</strong>
                      <span className="admin-muted">
                        {identifiedStamp.delivered_by_code ?? "Sin trainer code"}
                      </span>
                      <span className="admin-muted">
                        {identifiedStamp.delivered_by_role
                          ? `Rol: ${identifiedStamp.delivered_by_role}`
                          : "Sin registro de asignador"}
                      </span>
                    </div>
                    <div>
                      <span className="admin-claim-label">Fecha</span>
                      <strong>{new Date(identifiedStamp.awarded_at).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isHelpOpen ? (
        <div className="admin-modal-backdrop" onClick={() => setIsHelpOpen(false)}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Que es una stamp</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setIsHelpOpen(false)}
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
            <div className="admin-status-help-copy">
              <p>Una stamp es una entidad del sistema con un nombre o titulo y una imagen asociada.</p>
              <p>Aunque una stamp pueda reutilizarse en distintas colecciones y eventos, sigue siendo una stamp unica dentro del sistema.</p>
              <p>Lo que la hace unica no es solamente la imagen: dos stamps pueden compartir imagen y aun asi ser entidades distintas si representan cosas distintas dentro del sistema.</p>
              <p>Una stamp puede estar asignada a varias colecciones, y esas colecciones a su vez pueden estar asociadas a distintos eventos.</p>
              <p>Por eso es importante que la stamp sea independiente de su contexto de coleccion o evento si queres reutilizarla.</p>
              <p>Si una stamp depende demasiado de un contexto puntual, entonces deberia quedar atada a ese contexto y no reutilizarse.</p>
              <p>La ventaja de mantenerla independiente es que se puede trackear de forma global, mas alla de en que coleccion o evento fue conseguida.</p>
              <p>Ejemplo: Groudon shiny puede ser una stamp reutilizada en varias colecciones, como incursiones de Groudon, incursiones primigenias o incursiones legendarias.</p>
              <p>Asi es posible saber quien obtuvo un Groudon shiny independientemente del evento o la coleccion donde lo consiguio.</p>
              <p>
                <strong>
                  Cuando una stamp se entrega a una persona, esa entrega genera su propio claim code. El
                  claim code es el codigo identificatorio de cada stamp entregada y es lo que la vuelve
                  unica a nivel de asignacion.
                </strong>
              </p>
              <p>
                Gracias a ese codigo, el sistema puede interpretar cuando fue entregada, a quien, para
                que evento y coleccion, y por que mod o admin fue asignada.
              </p>
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
                    setStampForm((prev) => ({ ...prev, image_url: image.url }));
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

