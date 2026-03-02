"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import type {
  AdminAlbumRow,
  TrainerLookupState,
} from "../_lib/types";

type AwardTarget = {
  stampId: string;
  stampName: string;
  stampImageUrl: string | null;
  collectionId: string;
  collectionName: string;
  eventId: string;
  eventName: string;
} | null;

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function normalizeTrainerCode(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "");
  if (digits.length < 12) return null;
  const code = digits.slice(-12);
  return code.length === 12 ? code : null;
}

export default function AdminAlbumsPage() {
  const { userId } = useAdminAccess();
  const [albumRows, setAlbumRows] = useState<AdminAlbumRow[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [awardTarget, setAwardTarget] = useState<AwardTarget>(null);
  const [trainerCodeInput, setTrainerCodeInput] = useState("");
  const [trainerLookup, setTrainerLookup] = useState<TrainerLookupState>({
    loading: false,
    name: null,
    userId: null,
    error: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const { data, error } = await supabase.rpc("admin_get_albums");

    if (error) {
      setFeedback(error.message);
      return;
    }

    setAlbumRows((data as AdminAlbumRow[] | null) ?? []);
  };

  useEffect(() => {
    void loadPageData();
  }, []);

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

  useEffect(() => {
    if (!awardTarget) {
      stopScanner();
      setIsScannerOpen(false);
      return;
    }
  }, [awardTarget, stopScanner]);

  useEffect(() => {
    const lookupTrainer = async () => {
      const normalizedCode = trainerCodeInput.trim();

      if (normalizedCode.length !== 12) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: null,
        });
        return;
      }

      setTrainerLookup((prev) => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase
        .from("profiles")
        .select("id, trainer_name, active")
        .eq("trainer_code", normalizedCode)
        .maybeSingle();

      if (error) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: "No se pudo buscar el entrenador.",
        });
        return;
      }

      if (!data) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: "No existe un usuario con ese codigo.",
        });
        return;
      }

      if (!data.active) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: "Ese usuario todavia no esta habilitado.",
        });
        return;
      }

      setTrainerLookup({
        loading: false,
        name: data.trainer_name,
        userId: data.id,
        error: null,
      });
    };

    void lookupTrainer();
  }, [trainerCodeInput]);

  useEffect(() => {
    if (!isScannerOpen) {
      stopScanner();
      return;
    }

    const BarcodeDetectorApi = (
      window as Window & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      }
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

            const normalizedCode = normalizeTrainerCode(rawValue);
            if (!normalizedCode) {
              setScannerError("El QR no contiene un codigo de entrenador valido.");
              return;
            }

            setTrainerCodeInput(normalizedCode);
            setScannerError(null);
            setIsScannerOpen(false);
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
  }, [isScannerOpen, stopScanner]);

  const albums = Array.from(
    albumRows.reduce((eventsMap, row) => {
      if (!eventsMap.has(row.event_id)) {
        eventsMap.set(row.event_id, {
          id: row.event_id,
          name: row.event_name,
          starts_at: row.event_starts_at,
          ends_at: row.event_ends_at,
          description: row.event_description,
          image_url: row.event_image_url,
          collections: new Map<
            string,
            {
              id: string;
              name: string;
              description: string | null;
              image_url: string | null;
              stamps: Array<{
                id: string;
                name: string;
                description: string | null;
                image_url: string | null;
              }>;
            }
          >(),
        });
      }

      const eventItem = eventsMap.get(row.event_id)!;

      if (!eventItem.collections.has(row.collection_id)) {
        eventItem.collections.set(row.collection_id, {
          id: row.collection_id,
          name: row.collection_name,
          description: row.collection_description,
          image_url: row.collection_image_url,
          stamps: [],
        });
      }

      if (row.stamp_id && row.stamp_name) {
        eventItem.collections.get(row.collection_id)!.stamps.push({
          id: row.stamp_id,
          name: row.stamp_name,
          description: row.stamp_description,
          image_url: row.stamp_image_url,
        });
      }

      return eventsMap;
    }, new Map<string, {
      id: string;
      name: string;
      starts_at: string;
      ends_at: string | null;
      description: string | null;
      image_url: string | null;
      collections: Map<string, {
        id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        stamps: Array<{
          id: string;
          name: string;
          description: string | null;
          image_url: string | null;
        }>;
      }>;
    }>())
      .values(),
  ).map((eventItem) => ({
    ...eventItem,
    collections: Array.from(eventItem.collections.values()),
  }));

  const filteredEvents = albums.filter((eventItem) => {
    if (!activeSearch) return true;

    return [
      eventItem.name,
      eventItem.description ?? "",
      eventItem.collections.map((collectionItem) => collectionItem.name).join(" "),
      eventItem.collections
        .flatMap((collectionItem) => collectionItem.stamps.map((stampItem) => stampItem.name))
        .join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(activeSearch);
  });

  const openAwardModalWithContext = (
    stampItem: { id: string; name: string; image_url: string | null },
    collectionId: string,
    eventId: string,
  ) => {
    const event = albums.find((item) => item.id === eventId);
    const collection = event?.collections.find((item) => item.id === collectionId);

    if (!collection || !event) {
      setFeedback("No se pudo resolver la coleccion o el evento de esta stamp.");
      return;
    }

    setTrainerCodeInput("");
    setTrainerLookup({
      loading: false,
      name: null,
      userId: null,
      error: null,
    });
    setIsScannerOpen(false);
    setScannerError(null);
    setAwardTarget({
      stampId: stampItem.id,
      stampName: stampItem.name,
      stampImageUrl: stampItem.image_url,
      collectionId,
      collectionName: collection.name,
      eventId,
      eventName: event.name,
    });
  };

  const closeAwardModal = () => {
    setAwardTarget(null);
    setTrainerCodeInput("");
    setTrainerLookup({
      loading: false,
      name: null,
      userId: null,
      error: null,
    });
    setIsScannerOpen(false);
    setScannerError(null);
  };

  const handleAwardStamp = async () => {
    if (!userId || !awardTarget || !trainerCodeInput.trim()) {
      setFeedback("Ingresa un codigo de entrenador.");
      return;
    }

    if (!trainerLookup.userId) {
      setFeedback("Confirma un entrenador valido antes de entregar la stamp.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase
        .from("user_stamps")
        .insert({
          user_id: trainerLookup.userId,
          stamp_id: awardTarget.stampId,
          collection_id: awardTarget.collectionId,
          event_id: awardTarget.eventId,
          awarded_by: userId,
        })
        .select("claim_code")
        .single();

      if (error) {
        if ("code" in error && error.code === "23505") {
          setFeedback(`${trainerLookup.name} ya tiene esta stamp.`);
          return;
        }
        throw error;
      }

      setFeedback(
        `Stamp entregada a ${trainerLookup.name}. Codigo: ${data?.claim_code ?? "sin codigo"}.`,
      );
      closeAwardModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo entregar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Albumes</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en albumes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-list">
        {filteredEvents.map((eventItem) => {
          const albumCollections = eventItem.collections;

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
                  <span className="admin-item-name">{eventItem.name}</span>
                  <span className="admin-date-chip">
                    {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fin"}
                  </span>
                </button>
              </div>
              {expandedEventId === eventItem.id ? (
                <div className="admin-expanded">
                  {albumCollections.length ? (
                    <div className="admin-album-collections">
                      {albumCollections.map((collectionItem) => {
                        const albumStamps = collectionItem.stamps;

                        return (
                          <div key={collectionItem.id} className="admin-album-collection">
                            <div className="admin-album-collection-header">
                              <span className="admin-item-name">{collectionItem.name}</span>
                            </div>
                            <div className="admin-expanded-stamps">
                              {albumStamps.length ? (
                                albumStamps.map((stampItem) => (
                                  <button
                                    key={`${eventItem.id}-${collectionItem.id}-${stampItem.id}`}
                                    type="button"
                                    className="admin-stamp-card"
                                    onClick={() =>
                                      openAwardModalWithContext(
                                        stampItem,
                                        collectionItem.id,
                                        eventItem.id,
                                      )
                                    }
                                  >
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
                                  </button>
                                ))
                              ) : (
                                <p className="admin-muted admin-muted-small">
                                  Esta coleccion no tiene stamps asignadas.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="admin-muted">Este evento no tiene colecciones asignadas.</p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {awardTarget ? (
        <div className="admin-modal-backdrop" onClick={closeAwardModal}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Entregar stamp</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={closeAwardModal}
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

            <div className="admin-award-card">
              {awardTarget.stampImageUrl ? (
                <img
                  src={awardTarget.stampImageUrl}
                  alt={awardTarget.stampName}
                  className="admin-award-thumb"
                />
              ) : null}
              <p className="admin-item-name">{awardTarget.stampName}</p>
              <p className="admin-muted admin-muted-small">{awardTarget.collectionName}</p>
              <p className="admin-muted admin-muted-small">{awardTarget.eventName}</p>
            </div>

            <div className="admin-award-form">
              <input
                className="auth-input"
                placeholder="Codigo de entrenador"
                value={trainerCodeInput}
                onChange={(event) => setTrainerCodeInput(event.target.value.replace(/\D/g, "").slice(0, 12))}
              />
              <button
                type="button"
                className="admin-mini-btn"
                onClick={() => {
                  setScannerError(null);
                  setIsScannerOpen((current) => !current);
                }}
              >
                Escanear QR
              </button>
              {trainerLookup.loading ? (
                <p className="admin-muted admin-muted-small">Buscando entrenador...</p>
              ) : null}
              {trainerLookup.name ? (
                <p className="admin-muted admin-muted-small">
                  Entrenador: <strong>{trainerLookup.name}</strong>
                </p>
              ) : null}
              {trainerLookup.error ? (
                <p className="admin-error admin-error-small">{trainerLookup.error}</p>
              ) : null}
              {isScannerOpen ? (
                <div className="admin-scanner-panel">
                  <video ref={videoRef} className="admin-scanner-video" muted playsInline />
                  {scannerError ? <p className="admin-error admin-error-small">{scannerError}</p> : null}
                </div>
              ) : null}
              <button
                className="access-button"
                type="button"
                onClick={handleAwardStamp}
                disabled={isSaving || !trainerLookup.userId}
              >
                {isSaving ? "Entregando..." : "Entregar stamp"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

