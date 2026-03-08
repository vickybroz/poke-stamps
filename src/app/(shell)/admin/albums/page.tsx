"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import type {
  AdminAlbumRow,
  TrainerLookupState,
  UserStatus,
  UserItem,
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

function getTrainerOptionLabel(user: UserItem) {
  return `${user.trainer_code} - ${user.trainer_name?.trim() || "Unnamed trainer"}`;
}

function getStatusLabel(status: UserStatus) {
  return status === "active"
    ? "Active"
    : status === "pending"
      ? "Pending"
      : status === "provisional"
        ? "Provisional"
        : "Inactive";
}

function createEmptyTrainerLookup(): TrainerLookupState {
  return {
    loading: false,
    name: null,
    userId: null,
    status: null,
    statusLabel: null,
    requiresProvisionalConfirmation: false,
    info: null,
    error: null,
  };
}

export default function AdminAlbumsPage() {
  const { userId } = useAdminAccess();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [albumRows, setAlbumRows] = useState<AdminAlbumRow[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [awardTarget, setAwardTarget] = useState<AwardTarget>(null);
  const [isManualAwardOpen, setIsManualAwardOpen] = useState(false);
  const [manualEventSearch, setManualEventSearch] = useState("");
  const [manualCollectionSearch, setManualCollectionSearch] = useState("");
  const [manualStampSearch, setManualStampSearch] = useState("");
  const [manualEventId, setManualEventId] = useState<string | null>(null);
  const [manualCollectionId, setManualCollectionId] = useState<string | null>(null);
  const [manualStampId, setManualStampId] = useState<string | null>(null);
  const [trainerCodeInput, setTrainerCodeInput] = useState("");
  const [isTrainerAutocompleteOpen, setIsTrainerAutocompleteOpen] = useState(false);
  const [trainerLookup, setTrainerLookup] = useState<TrainerLookupState>(createEmptyTrainerLookup);
  const [hasConfirmedProvisionalCreation, setHasConfirmedProvisionalCreation] = useState(false);
  const [isDuplicateAssignment, setIsDuplicateAssignment] = useState(false);
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [autoAssignDismissed, setAutoAssignDismissed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldOpenAssignModal = searchParams.get("assign") === "1";

  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const [{ data: albumData, error: albumError }, { data: userData, error: userError }] =
      await Promise.all([supabase.rpc("admin_get_albums"), supabase.rpc("admin_list_users")]);

    if (albumError || userError) {
      setFeedback(albumError?.message ?? userError?.message ?? "Could not load admin data.");
      return;
    }

    setAlbumRows((albumData as AdminAlbumRow[] | null) ?? []);
    setUsers((userData as UserItem[] | null) ?? []);
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
    if (!awardTarget && !isManualAwardOpen) {
      stopScanner();
      setIsScannerOpen(false);
      return;
    }
  }, [awardTarget, isManualAwardOpen, stopScanner]);

  useEffect(() => {
    const lookupTrainer = async () => {
      const normalizedInput = trainerCodeInput.trim().toLowerCase();
      const selectedUser =
        users.find((user) => user.trainer_code === trainerCodeInput.trim()) ??
        users.find((user) => (user.trainer_name ?? "").trim().toLowerCase() === normalizedInput);
      const normalizedCode = selectedUser?.trainer_code ?? normalizeTrainerCode(trainerCodeInput.trim());

      if (!normalizedCode) {
        setTrainerLookup({
          ...createEmptyTrainerLookup(),
        });
        setIsDuplicateAssignment(false);
        return;
      }

      setTrainerLookup({
        ...createEmptyTrainerLookup(),
        loading: true,
      });

      const { data, error } = await supabase
        .from("profiles")
        .select("id, auth_user_id, trainer_name, trainer_code, status")
        .eq("trainer_code", normalizedCode)
        .maybeSingle();

      if (error) {
        setTrainerLookup({
          ...createEmptyTrainerLookup(),
          loading: false,
          error: "No se pudo buscar el entrenador.",
        });
        return;
      }

      if (!data) {
        if (normalizedCode) {
          setTrainerLookup({
            ...createEmptyTrainerLookup(),
            loading: false,
            info: "Este trainer code no existe todavia. Si asignas la stamp, se creara un usuario provisorio.",
            requiresProvisionalConfirmation: true,
          });
          return;
        }

        setTrainerLookup({
          ...createEmptyTrainerLookup(),
          loading: false,
          error: "No existe un usuario con ese codigo.",
        });
        return;
      }

      setTrainerLookup({
        loading: false,
        name: data.trainer_name ?? `Trainer ${data.trainer_code}`,
        userId: data.id,
        status: data.status,
        statusLabel: getStatusLabel(data.status),
        requiresProvisionalConfirmation: false,
        info: null,
        error:
          data.status === "inactive"
            ? "No se puede asignar una stamp a un usuario inactive."
            : null,
      });
    };

    void lookupTrainer();
  }, [trainerCodeInput, users]);

  const trainerSuggestions = trainerCodeInput.trim()
    ? users
        .filter((user) => {
          const query = trainerCodeInput.trim().toLowerCase();
          return (
            user.trainer_code.includes(query.replace(/\D/g, "")) ||
            (user.trainer_name ?? "").toLowerCase().includes(query)
          );
        })
        .slice(0, 8)
    : [];

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
            setHasConfirmedProvisionalCreation(false);
            setIsTrainerAutocompleteOpen(false);
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

  useEffect(() => {
    if (!shouldOpenAssignModal) {
      if (autoAssignDismissed) {
        setAutoAssignDismissed(false);
      }
      return;
    }

    if (isManualAwardOpen || autoAssignDismissed) {
      return;
    }

    openManualAwardModal();
  }, [autoAssignDismissed, isManualAwardOpen, shouldOpenAssignModal]);

  const albums = useMemo(
    () =>
      Array.from(
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
      })),
    [albumRows],
  );

  const filteredEvents = useMemo(
    () =>
      albums.filter((eventItem) => {
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
      }),
    [activeSearch, albums],
  );

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
    setIsTrainerAutocompleteOpen(false);
    setTrainerLookup(createEmptyTrainerLookup());
    setHasConfirmedProvisionalCreation(false);
    setIsDuplicateAssignment(false);
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

  const openManualAwardModal = () => {
    setManualEventSearch("");
    setManualCollectionSearch("");
    setManualStampSearch("");
    setManualEventId(null);
    setManualCollectionId(null);
    setManualStampId(null);
    setAwardTarget(null);
    setTrainerCodeInput("");
    setIsTrainerAutocompleteOpen(false);
    setTrainerLookup(createEmptyTrainerLookup());
    setHasConfirmedProvisionalCreation(false);
    setIsDuplicateAssignment(false);
    setIsScannerOpen(false);
    setScannerError(null);
    setIsManualAwardOpen(true);
  };

  const closeAwardModal = () => {
    setAwardTarget(null);
    setTrainerCodeInput("");
    setTrainerLookup(createEmptyTrainerLookup());
    setHasConfirmedProvisionalCreation(false);
    setIsDuplicateAssignment(false);
    setIsScannerOpen(false);
    setScannerError(null);
  };

  const closeManualAwardModal = () => {
    if (shouldOpenAssignModal) {
      setAutoAssignDismissed(true);
    }

    setIsManualAwardOpen(false);
    closeAwardModal();
    setManualEventSearch("");
    setManualCollectionSearch("");
    setManualStampSearch("");
    setManualEventId(null);
    setManualCollectionId(null);
    setManualStampId(null);

    if (shouldOpenAssignModal) {
      router.replace(pathname);
    }
  };

  const selectedEvent = manualEventId ? albums.find((item) => item.id === manualEventId) ?? null : null;
  const manualCollections = selectedEvent?.collections ?? [];
  const selectedCollection = manualCollectionId
    ? manualCollections.find((item) => item.id === manualCollectionId) ?? null
    : null;
  const manualStamps = selectedCollection?.stamps ?? [];
  const selectedStamp = manualStampId
    ? manualStamps.find((item) => item.id === manualStampId) ?? null
    : null;
  const manualAwardTarget = useMemo(
    () =>
      selectedEvent && selectedCollection && selectedStamp
        ? {
            stampId: selectedStamp.id,
            stampName: selectedStamp.name,
            stampImageUrl: selectedStamp.image_url,
            collectionId: selectedCollection.id,
            collectionName: selectedCollection.name,
            eventId: selectedEvent.id,
            eventName: selectedEvent.name,
          }
        : null,
    [selectedCollection, selectedEvent, selectedStamp],
  );

  const duplicateCheckEventId = isManualAwardOpen ? manualAwardTarget?.eventId ?? null : awardTarget?.eventId ?? null;
  const duplicateCheckCollectionId = isManualAwardOpen
    ? manualAwardTarget?.collectionId ?? null
    : awardTarget?.collectionId ?? null;
  const duplicateCheckStampId = isManualAwardOpen ? manualAwardTarget?.stampId ?? null : awardTarget?.stampId ?? null;

  useEffect(() => {
    if (
      !trainerLookup.userId ||
      !duplicateCheckEventId ||
      !duplicateCheckCollectionId ||
      !duplicateCheckStampId ||
      trainerLookup.status === "inactive"
    ) {
      setIsDuplicateAssignment(false);
      setDuplicateCheckLoading(false);
      return;
    }

    let cancelled = false;

    const checkDuplicateAssignment = async () => {
      setDuplicateCheckLoading(true);

      const { data, error } = await supabase
        .from("user_stamps")
        .select("id")
        .eq("user_id", trainerLookup.userId)
        .eq("event_id", duplicateCheckEventId)
        .eq("collection_id", duplicateCheckCollectionId)
        .eq("stamp_id", duplicateCheckStampId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        setDuplicateCheckLoading(false);
        return;
      }

      setIsDuplicateAssignment(Boolean(data));
      setDuplicateCheckLoading(false);
    };

    void checkDuplicateAssignment();

    return () => {
      cancelled = true;
    };
  }, [
    duplicateCheckCollectionId,
    duplicateCheckEventId,
    duplicateCheckStampId,
    trainerLookup.status,
    trainerLookup.userId,
  ]);

  const applyManualEventSearch = (value: string) => {
    setManualEventSearch(value);
    const match = albums.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    setManualEventId(match?.id ?? null);
    setManualCollectionSearch("");
    setManualStampSearch("");
    setManualCollectionId(null);
    setManualStampId(null);
  };

  const applyManualCollectionSearch = (value: string) => {
    setManualCollectionSearch(value);
    const match = manualCollections.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    setManualCollectionId(match?.id ?? null);
    setManualStampSearch("");
    setManualStampId(null);
  };

  const applyManualStampSearch = (value: string) => {
    setManualStampSearch(value);
    const match = manualStamps.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    setManualStampId(match?.id ?? null);
  };

  const handleAwardStamp = async () => {
    const activeAwardTarget = isManualAwardOpen ? manualAwardTarget : awardTarget;
    const normalizedTrainerCode = normalizeTrainerCode(trainerCodeInput.trim());

    if (!userId || !activeAwardTarget || !trainerCodeInput.trim()) {
      setFeedback("Ingresa un codigo de entrenador.");
      return;
    }

    if (!normalizedTrainerCode) {
      setFeedback("Ingresa un codigo de entrenador valido de 12 digitos.");
      return;
    }

    if (trainerLookup.requiresProvisionalConfirmation && !hasConfirmedProvisionalCreation) {
      setFeedback("Debes confirmar la creacion del usuario provisorio antes de asignar la stamp.");
      return;
    }

    if (isDuplicateAssignment) {
      setFeedback("Este usuario ya tiene esta stamp en esa coleccion y evento.");
      return;
    }

    if (!trainerLookup.userId && !trainerLookup.requiresProvisionalConfirmation) {
      setFeedback("Confirma un entrenador valido antes de entregar la stamp.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase.rpc("admin_assign_stamp", {
        p_trainer_code: normalizedTrainerCode,
        p_event_id: activeAwardTarget.eventId,
        p_collection_id: activeAwardTarget.collectionId,
        p_stamp_id: activeAwardTarget.stampId,
        p_allow_create_provisional: trainerLookup.requiresProvisionalConfirmation && hasConfirmedProvisionalCreation,
      });

      if (error) {
        throw error;
      }

      const assignedRecord = Array.isArray(data) ? data[0] : null;
      const assignedTrainerName =
        assignedRecord?.trainer_name ?? trainerLookup.name ?? `Trainer ${normalizedTrainerCode}`;

        setFeedback(
          assignedRecord?.created_provisional
            ? `Se creo un usuario provisorio y se asigno la stamp a ${assignedTrainerName}. Codigo: ${assignedRecord?.claim_code ?? "sin codigo"}.`
            : `Stamp entregada a ${assignedTrainerName}. Codigo: ${assignedRecord?.claim_code ?? "sin codigo"}.`,
        );
        if (assignedRecord?.created_provisional) {
          setUsers((current) => {
            if (current.some((user) => user.id === assignedRecord.user_id)) {
              return current;
            }

            return [
              {
                id: assignedRecord.user_id,
                auth_user_id: null,
                trainer_name: assignedRecord.trainer_name ?? null,
                trainer_code: assignedRecord.trainer_code,
                email: null,
                role: "user",
                status: "provisional",
              },
              ...current,
            ];
          });
        }
        if (isManualAwardOpen) {
          closeManualAwardModal();
        } else {
          closeAwardModal();
        }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo entregar la stamp.";
      setFeedback(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-box">
      <div className="admin-box-header admin-box-header-title">
        <h2 className="admin-subtitle admin-subtitle-no-margin">Albumes</h2>
        <button
          type="button"
          className="admin-mini-btn admin-mini-btn-provisional"
          onClick={openManualAwardModal}
          disabled={isSaving || !userId}
        >
          Asignar stamp
        </button>
      </div>

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

      {awardTarget && !isManualAwardOpen ? (
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
                placeholder="Trainer code or name"
                value={trainerCodeInput}
                onChange={(event) => {
                  setTrainerCodeInput(event.target.value);
                  setIsTrainerAutocompleteOpen(true);
                  setHasConfirmedProvisionalCreation(false);
                }}
              />
              {isTrainerAutocompleteOpen && trainerSuggestions.length ? (
                <div className="admin-autocomplete-list">
                  {trainerSuggestions.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="admin-autocomplete-item"
                      onClick={() => {
                        setTrainerCodeInput(user.trainer_code);
                        setIsTrainerAutocompleteOpen(false);
                        setHasConfirmedProvisionalCreation(false);
                      }}
                    >
                      {getTrainerOptionLabel(user)}
                    </button>
                  ))}
                </div>
              ) : null}
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
              {duplicateCheckLoading ? (
                <p className="admin-muted admin-muted-small">Validando asignacion...</p>
              ) : null}
              {trainerLookup.name ? (
                <>
                  <p className="admin-muted admin-muted-small">
                    Trainer: <strong>{trainerLookup.name}</strong>
                  </p>
                  <p className="admin-muted admin-muted-small">
                    Status: <strong>{trainerLookup.statusLabel}</strong>
                  </p>
                </>
              ) : null}
              {trainerLookup.info ? (
                <p className="admin-muted admin-muted-small">{trainerLookup.info}</p>
              ) : null}
              {trainerLookup.requiresProvisionalConfirmation ? (
                <label className="admin-check-item">
                  <input
                    type="checkbox"
                    checked={hasConfirmedProvisionalCreation}
                    onChange={(event) => setHasConfirmedProvisionalCreation(event.target.checked)}
                  />
                  <span>Confirmo que quiero crear el usuario provisorio con esta asignacion.</span>
                </label>
              ) : null}
              {isDuplicateAssignment ? (
                <p className="admin-error admin-error-small">
                  Este usuario ya tiene esta stamp en esa coleccion y evento.
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
                disabled={
                  isSaving ||
                  duplicateCheckLoading ||
                  isDuplicateAssignment ||
                  trainerLookup.status === "inactive" ||
                  (!trainerLookup.userId && !trainerLookup.requiresProvisionalConfirmation) ||
                  (trainerLookup.requiresProvisionalConfirmation && !hasConfirmedProvisionalCreation)
                }
              >
                {isSaving ? "Entregando..." : "Entregar stamp"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isManualAwardOpen ? (
        <div className="admin-modal-backdrop" onClick={closeManualAwardModal}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Asignar stamp</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={closeManualAwardModal}
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
                list="manual-award-events"
                placeholder="Buscar evento"
                value={manualEventSearch}
                onChange={(event) => applyManualEventSearch(event.target.value)}
              />
              <datalist id="manual-award-events">
                {albums.map((eventItem) => (
                  <option key={eventItem.id} value={eventItem.name} />
                ))}
              </datalist>

              {selectedEvent ? (
                <>
                  <input
                    className="auth-input"
                    list="manual-award-collections"
                    placeholder="Buscar coleccion"
                    value={manualCollectionSearch}
                    onChange={(event) => applyManualCollectionSearch(event.target.value)}
                  />
                  <datalist id="manual-award-collections">
                    {manualCollections.map((collectionItem) => (
                      <option key={collectionItem.id} value={collectionItem.name} />
                    ))}
                  </datalist>
                </>
              ) : null}

              {selectedCollection ? (
                <>
                  <input
                    className="auth-input"
                    list="manual-award-stamps"
                    placeholder="Buscar stamp"
                    value={manualStampSearch}
                    onChange={(event) => applyManualStampSearch(event.target.value)}
                  />
                  <datalist id="manual-award-stamps">
                    {manualStamps.map((stampItem) => (
                      <option key={stampItem.id} value={stampItem.name} />
                    ))}
                  </datalist>
                </>
              ) : null}
            </div>

            {manualAwardTarget ? (
              <>
                <div className="admin-award-card">
                  {manualAwardTarget.stampImageUrl ? (
                    <img
                      src={manualAwardTarget.stampImageUrl}
                      alt={manualAwardTarget.stampName}
                      className="admin-award-thumb"
                    />
                  ) : null}
                  <p className="admin-item-name">{manualAwardTarget.stampName}</p>
                  <p className="admin-muted admin-muted-small">
                    {manualAwardTarget.eventName} / {manualAwardTarget.collectionName} / {manualAwardTarget.stampName}
                  </p>
                </div>

                <div className="admin-award-form">
                  <input
                    className="auth-input"
                    placeholder="Trainer code or name"
                    value={trainerCodeInput}
                    onChange={(event) => {
                      setTrainerCodeInput(event.target.value);
                      setIsTrainerAutocompleteOpen(true);
                      setHasConfirmedProvisionalCreation(false);
                    }}
                  />
                  {isTrainerAutocompleteOpen && trainerSuggestions.length ? (
                    <div className="admin-autocomplete-list">
                      {trainerSuggestions.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className="admin-autocomplete-item"
                          onClick={() => {
                            setTrainerCodeInput(user.trainer_code);
                            setIsTrainerAutocompleteOpen(false);
                            setHasConfirmedProvisionalCreation(false);
                          }}
                        >
                          {getTrainerOptionLabel(user)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="admin-mini-btn"
                    onClick={() => {
                      setScannerError(null);
                      setIsScannerOpen((current) => !current);
                    }}
                  >
                    {isScannerOpen ? "Cerrar scanner" : "Escanear QR"}
                  </button>
                  {trainerLookup.loading ? (
                    <p className="admin-muted admin-muted-small">Buscando trainer...</p>
                  ) : null}
                  {duplicateCheckLoading ? (
                    <p className="admin-muted admin-muted-small">Validando asignacion...</p>
                  ) : null}
                  {trainerLookup.name ? (
                    <>
                      <p className="admin-muted admin-muted-small">
                        Trainer: <strong>{trainerLookup.name}</strong>
                      </p>
                  <p className="admin-muted admin-muted-small">
                    Status: <strong>{trainerLookup.statusLabel}</strong>
                  </p>
                    </>
                  ) : null}
                  {trainerLookup.info ? (
                    <p className="admin-muted admin-muted-small">{trainerLookup.info}</p>
                  ) : null}
                  {trainerLookup.requiresProvisionalConfirmation ? (
                    <label className="admin-check-item">
                      <input
                        type="checkbox"
                        checked={hasConfirmedProvisionalCreation}
                        onChange={(event) => setHasConfirmedProvisionalCreation(event.target.checked)}
                      />
                      <span>Confirmo que quiero crear el usuario provisorio con esta asignacion.</span>
                    </label>
                  ) : null}
                  {isDuplicateAssignment ? (
                    <p className="admin-error admin-error-small">
                      Este usuario ya tiene esta stamp en esa coleccion y evento.
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
                    disabled={
                      isSaving ||
                      duplicateCheckLoading ||
                      isDuplicateAssignment ||
                      trainerLookup.status === "inactive" ||
                      (!trainerLookup.userId && !trainerLookup.requiresProvisionalConfirmation) ||
                      (trainerLookup.requiresProvisionalConfirmation && !hasConfirmedProvisionalCreation)
                    }
                  >
                    {isSaving ? "Entregando..." : "Asignar stamp"}
                  </button>
                </div>
              </>
            ) : (
              <p className="admin-muted admin-muted-small">
                Selecciona evento, coleccion y stamp para continuar.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

