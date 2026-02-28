"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type AdminState = {
  trainerName: string | null;
  error: string | null;
  loading: boolean;
  userId: string | null;
};

type EventItem = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  image_url: string | null;
};

type CollectionItem = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};

type StampItem = {
  id: string;
  collection_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};

type UserItem = {
  id: string;
  trainer_name: string;
  trainer_code: string;
  email: string | null;
  role: string;
};

type AdminTab = "events" | "collections" | "stamps" | "gallery" | "users";
type UploadTarget = "event" | "collection" | "stamp";
type ModalMode = "create" | "edit";
type DeleteTarget = {
  type: UploadTarget | "gallery";
  id: string;
  name: string;
} | null;
type AwardTarget = {
  stampId: string;
  stampName: string;
  stampImageUrl: string | null;
  collectionId: string;
  collectionName: string;
  eventId: string;
  eventName: string;
} | null;

type ImageOption = {
  path: string;
  url: string;
  label: string;
  folder: "events" | "collections" | "stamps" | "gallery";
};

type TrainerLookupState = {
  loading: boolean;
  name: string | null;
  userId: string | null;
  error: string | null;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

const IMAGE_BUCKET = "poke-stamp-images";
const MAX_IMAGE_SIZE_BYTES = 300 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<AdminState>({
    trainerName: null,
    error: null,
    loading: true,
    userId: null,
  });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("events");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [eventIdsWithCollections, setEventIdsWithCollections] = useState<string[]>([]);
  const [collectionIdsWithStamps, setCollectionIdsWithStamps] = useState<string[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [createModalTab, setCreateModalTab] = useState<AdminTab | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [isSaving, setIsSaving] = useState(false);
  const [openGalleryTarget, setOpenGalleryTarget] = useState<UploadTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [awardTarget, setAwardTarget] = useState<AwardTarget>(null);
  const [trainerCodeInput, setTrainerCodeInput] = useState("");
  const [trainerLookup, setTrainerLookup] = useState<TrainerLookupState>({
    loading: false,
    name: null,
    userId: null,
    error: null,
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<AdminTab, string>>({
    events: "",
    collections: "",
    stamps: "",
    gallery: "",
    users: "",
  });
  const [eventForm, setEventForm] = useState({
    id: "",
    name: "",
    starts_at: "",
    ends_at: "",
    description: "",
    image_url: "",
  });
  const [collectionForm, setCollectionForm] = useState({
    id: "",
    event_id: "",
    name: "",
    description: "",
    image_url: "",
  });
  const [stampForm, setStampForm] = useState({
    id: "",
    collection_id: "",
    name: "",
    description: "",
    image_url: "",
  });
  const [galleryForm, setGalleryForm] = useState<{
    file: File | null;
  }>({
    file: null,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const eventSearch = searchTerms.events.trim().toLowerCase();
  const collectionSearch = searchTerms.collections.trim().toLowerCase();
  const stampSearch = searchTerms.stamps.trim().toLowerCase();
  const gallerySearch = searchTerms.gallery.trim().toLowerCase();
  const userSearch = searchTerms.users.trim().toLowerCase();

  const loadImageLibrary = async () => {
    const folders: ImageOption["folder"][] = ["events", "collections", "stamps", "gallery"];

    const batches = await Promise.all(
      folders.map(async (folder) => {
        const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list(folder, {
          limit: 200,
          sortBy: { column: "name", order: "asc" },
        });

        if (error || !data) {
          setFeedback("No se pudieron cargar algunas imagenes del bucket.");
          return [];
        }

        return data
          .filter((item) => item.name && !item.name.endsWith("/"))
          .map((item) => {
            const path = `${folder}/${item.name}`;
            const { data: publicData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

            return {
              path,
              url: publicData.publicUrl,
              label: item.name,
              folder,
            } satisfies ImageOption;
          });
      }),
    );

    setImageOptions(batches.flat());
  };

  const reloadCollectionSummary = async () => {
    const { data } = await supabase.from("collections").select("event_id");
    const ids = Array.from(
      new Set(
        ((data as Array<{ event_id: string }> | null) ?? []).map((item) => item.event_id),
      ),
    );
    setEventIdsWithCollections(ids);
  };

  const reloadStampSummary = async () => {
    const { data } = await supabase.from("stamps").select("collection_id");
    const ids = Array.from(
      new Set(
        ((data as Array<{ collection_id: string }> | null) ?? []).map(
          (item) => item.collection_id,
        ),
      ),
    );
    setCollectionIdsWithStamps(ids);
  };

  const loadEvents = async () => {
    const { data } = await supabase
      .from("events")
      .select("id, name, starts_at, ends_at, description, image_url")
      .order("created_at", { ascending: false });

    setEvents((data as EventItem[] | null) ?? []);
  };

  const loadCollections = async () => {
    const { data } = await supabase
      .from("collections")
      .select("id, event_id, name, description, image_url")
      .order("created_at", { ascending: false });

    setCollections((data as CollectionItem[] | null) ?? []);
  };

  const loadStamps = async () => {
    const { data } = await supabase
      .from("stamps")
      .select("id, collection_id, name, description, image_url")
      .order("created_at", { ascending: false });

    setStamps((data as StampItem[] | null) ?? []);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from("admin_users")
      .select("id, trainer_name, trainer_code, email, role")
      .order("trainer_name", { ascending: true });

    setUsers((data as UserItem[] | null) ?? []);
  };

  const reloadAll = useCallback(async () => {
    await Promise.all([
      loadEvents(),
      loadCollections(),
      loadStamps(),
      loadUsers(),
      loadImageLibrary(),
      reloadCollectionSummary(),
      reloadStampSummary(),
    ]);
  }, []);

  const resetModalState = () => {
    setOpenGalleryTarget(null);
    setGalleryForm({ file: null });
    setEventForm({
      id: "",
      name: "",
      starts_at: "",
      ends_at: "",
      description: "",
      image_url: "",
    });
    setCollectionForm({
      id: "",
      event_id: selectedEventId ?? "",
      name: "",
      description: "",
      image_url: "",
    });
    setStampForm({
      id: "",
      collection_id: selectedCollectionId ?? "",
      name: "",
      description: "",
      image_url: "",
    });
  };

  const openCreateModal = (tab: AdminTab) => {
    setModalMode("create");
    resetModalState();
    setCreateModalTab(tab);
  };

  const closeCreateModal = () => {
    setCreateModalTab(null);
    setModalMode("create");
    resetModalState();
  };

  const openAwardModal = (stampItem: StampItem) => {
    const collection = collections.find((item) => item.id === stampItem.collection_id);
    const event = events.find((item) => item.id === collection?.event_id);

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
      collectionId: collection.id,
      collectionName: collection.name,
      eventId: event.id,
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

  const openEditModal = (target: UploadTarget, id: string) => {
    setModalMode("edit");
    setOpenGalleryTarget(null);

    if (target === "event") {
      const item = events.find((eventItem) => eventItem.id === id);
      if (!item) return;
      setEventForm({
        id: item.id,
        name: item.name,
        starts_at: item.starts_at,
        ends_at: item.ends_at ?? "",
        description: item.description ?? "",
        image_url: item.image_url ?? "",
      });
      setCreateModalTab("events");
      return;
    }

    if (target === "collection") {
      const item = collections.find((collectionItem) => collectionItem.id === id);
      if (!item) return;
      setCollectionForm({
        id: item.id,
        event_id: item.event_id,
        name: item.name,
        description: item.description ?? "",
        image_url: item.image_url ?? "",
      });
      setCreateModalTab("collections");
      return;
    }

    const item = stamps.find((stampItem) => stampItem.id === id);
    if (!item) return;
    setStampForm({
      id: item.id,
      collection_id: item.collection_id,
      name: item.name,
      description: item.description ?? "",
      image_url: item.image_url ?? "",
    });
    setCreateModalTab("stamps");
  };

  useEffect(() => {
    const loadAdminProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setState({
          trainerName: null,
          error: "Necesitas iniciar sesion para acceder a esta pagina.",
          loading: false,
          userId: null,
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("trainer_name, role, active")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profile) {
        setState({
          trainerName: null,
          error: "No se encontro tu perfil. Contacta a un administrador.",
          loading: false,
          userId: null,
        });
        return;
      }

      if (!profile.active) {
        setState({
          trainerName: null,
          error: "Tu cuenta esta desactivada.",
          loading: false,
          userId: null,
        });
        return;
      }

      if (profile.role !== "admin") {
        setState({
          trainerName: null,
          error: "No tienes permisos de administrador.",
          loading: false,
          userId: null,
        });
        return;
      }

      await reloadAll();

      setState({
        trainerName: profile.trainer_name,
        error: null,
        loading: false,
        userId: userData.user.id,
      });
    };

    void loadAdminProfile();
  }, [reloadAll]);

  const stopScanner = useCallback(() => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (!awardTarget) {
      return;
    }

    const trainerCode = trainerCodeInput.trim();

    if (!trainerCode) {
      setTrainerLookup({
        loading: false,
        name: null,
        userId: null,
        error: null,
      });
      return;
    }

    let active = true;
    setTrainerLookup({
      loading: true,
      name: null,
      userId: null,
      error: null,
    });

    const timeoutId = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, trainer_name, active")
        .eq("trainer_code", trainerCode)
        .single();

      if (!active) {
        return;
      }

      if (error || !data) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: "No se encontro un entrenador con ese codigo.",
        });
        return;
      }

      if (!data.active) {
        setTrainerLookup({
          loading: false,
          name: null,
          userId: null,
          error: "Ese entrenador esta desactivado.",
        });
        return;
      }

      setTrainerLookup({
        loading: false,
        name: data.trainer_name,
        userId: data.id,
        error: null,
      });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [awardTarget, trainerCodeInput]);

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
      setScannerError("Tu navegador no soporta escaneo QR en esta pagina.");
      setIsScannerOpen(false);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;

        if (!videoRef.current) {
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new BarcodeDetectorApi({ formats: ["qr_code"] });

        scannerIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) {
            return;
          }

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results[0]?.rawValue;

            if (!rawValue) {
              return;
            }

            const normalizedCode = rawValue.replace(/\D/g, "");

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

  const renderImageControls = (
    target: UploadTarget,
    selectedUrl: string,
    onSelect: (url: string) => void,
  ) => {
    const images = imageOptions;

    return (
      <div className="admin-image-picker">
        {selectedUrl ? (
          <div className="admin-selected-image">
            <img src={selectedUrl} alt="Imagen seleccionada" className="admin-selected-thumb" />
            <button
              type="button"
              className="admin-mini-btn danger"
              onClick={() => {
                onSelect("");
                setOpenGalleryTarget(null);
              }}
            >
              Quitar imagen
            </button>
          </div>
        ) : (
          <>
            <div className="admin-image-actions">
              {images.length ? (
                <button
                  type="button"
                  className="admin-icon-action"
                  aria-label="Elegir de galeria"
                  onClick={() => setOpenGalleryTarget((prev) => (prev === target ? null : target))}
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
          </>
        )}
      </div>
    );
  };

  const handleGallerySelection = (url: string) => {
    if (openGalleryTarget === "event") {
      setEventForm((prev) => ({ ...prev, image_url: url }));
    }
    if (openGalleryTarget === "collection") {
      setCollectionForm((prev) => ({ ...prev, image_url: url }));
    }
    if (openGalleryTarget === "stamp") {
      setStampForm((prev) => ({ ...prev, image_url: url }));
    }
    setOpenGalleryTarget(null);
  };

  const handleSaveEvent = async () => {
    if (!state.userId || !eventForm.name || !eventForm.starts_at) {
      setFeedback("Completa nombre y fecha de inicio.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: eventForm.name,
        starts_at: eventForm.starts_at,
        ends_at: eventForm.ends_at || null,
        description: eventForm.description || null,
        image_url: eventForm.image_url || null,
        created_by: state.userId,
      };
      const { error } = eventForm.id
        ? await supabase.from("events").update(payload).eq("id", eventForm.id)
        : await supabase.from("events").insert(payload);

      if (error) throw error;

      await reloadAll();
      setFeedback(eventForm.id ? "Evento actualizado." : "Evento creado.");
      closeCreateModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo crear el evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCollection = async () => {
    if (!state.userId || !collectionForm.event_id || !collectionForm.name) {
      setFeedback("Selecciona evento y completa el nombre.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        event_id: collectionForm.event_id,
        name: collectionForm.name,
        description: collectionForm.description || null,
        image_url: collectionForm.image_url || null,
        created_by: state.userId,
      };
      const { error } = collectionForm.id
        ? await supabase.from("collections").update(payload).eq("id", collectionForm.id)
        : await supabase.from("collections").insert(payload);

      if (error) throw error;

      await reloadAll();
      setFeedback(collectionForm.id ? "Coleccion actualizada." : "Coleccion creada.");
      closeCreateModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo crear la coleccion.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStamp = async () => {
    if (!state.userId || !stampForm.collection_id || !stampForm.name) {
      setFeedback("Selecciona coleccion y completa el nombre.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        collection_id: stampForm.collection_id,
        name: stampForm.name,
        description: stampForm.description || null,
        image_url: stampForm.image_url || null,
        created_by: state.userId,
      };
      const { error } = stampForm.id
        ? await supabase.from("stamps").update(payload).eq("id", stampForm.id)
        : await supabase.from("stamps").insert(payload);

      if (error) throw error;

      await reloadAll();
      setFeedback(stampForm.id ? "Stamp actualizada." : "Stamp creada.");
      closeCreateModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo crear la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateGalleryImage = async () => {
    if (!galleryForm.file) {
      setFeedback("Selecciona una imagen.");
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(galleryForm.file.type)) {
      setFeedback("Formato no permitido. Usa JPG, PNG o WEBP.");
      return;
    }

    if (galleryForm.file.size > MAX_IMAGE_SIZE_BYTES) {
      setFeedback("La imagen supera 300KB. Comprimela antes de subir.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const safeName = galleryForm.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `gallery/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, galleryForm.file, {
        contentType: galleryForm.file.type,
        upsert: false,
      });

      if (error) throw error;

      await loadImageLibrary();
      setFeedback("Imagen subida.");
      closeCreateModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      if (deleteTarget.type === "event") {
        const { error } = await supabase.from("events").delete().eq("id", deleteTarget.id);
        if (error) throw error;
      }
      if (deleteTarget.type === "collection") {
        const { error } = await supabase.from("collections").delete().eq("id", deleteTarget.id);
        if (error) throw error;
      }
      if (deleteTarget.type === "stamp") {
        const { error } = await supabase.from("stamps").delete().eq("id", deleteTarget.id);
        if (error) throw error;
      }
      if (deleteTarget.type === "gallery") {
        const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([deleteTarget.id]);
        if (error) throw error;
      }

      await reloadAll();
      setFeedback("Item eliminado.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAwardStamp = async () => {
    if (!state.userId || !awardTarget || !trainerCodeInput.trim()) {
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
      const { error } = await supabase.from("user_stamps").insert({
        user_id: trainerLookup.userId,
        stamp_id: awardTarget.stampId,
        collection_id: awardTarget.collectionId,
        event_id: awardTarget.eventId,
        awarded_by: state.userId,
      });

      if (error) {
        if ("code" in error && error.code === "23505") {
          setFeedback(`${trainerLookup.name} ya tiene esta stamp.`);
          return;
        }
        throw error;
      }

      setFeedback(`Stamp entregada a ${trainerLookup.name}.`);
      closeAwardModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo entregar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const loadCollections = async () => {
      const query = supabase
        .from("collections")
        .select("id, event_id, name, description, image_url")
        .order("created_at", { ascending: false });

      const { data } = selectedEventId ? await query.eq("event_id", selectedEventId) : await query;

      setCollections((data as CollectionItem[] | null) ?? []);

      if (selectedEventId && selectedCollectionId) {
        const exists = ((data as CollectionItem[] | null) ?? []).some(
          (item) => item.id === selectedCollectionId,
        );

        if (!exists) {
          setSelectedCollectionId(null);
        }
      }
    };

    void loadCollections();
  }, [selectedEventId, selectedCollectionId]);

  useEffect(() => {
    const loadStamps = async () => {
      const query = supabase
        .from("stamps")
        .select("id, collection_id, name, description, image_url")
        .order("created_at", { ascending: false });

      const { data } = selectedCollectionId
        ? await query.eq("collection_id", selectedCollectionId)
        : await query;

      setStamps((data as StampItem[] | null) ?? []);
    };

    void loadStamps();
  }, [selectedCollectionId]);

  const renderCreateModal = () => {
    if (!createModalTab) return null;
    const isEditMode = modalMode === "edit";

    return (
      <div className="admin-modal-backdrop" onClick={closeCreateModal}>
        <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
          <div className="admin-modal-header">
            <div />
            <button
              type="button"
              className="admin-icon-close"
              onClick={closeCreateModal}
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
            {createModalTab === "events" ? (
              <>
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
                {renderImageControls("event", eventForm.image_url, (url) =>
                  setEventForm((prev) => ({ ...prev, image_url: url })),
                )}
                <button
                  className="access-button"
                  type="button"
                  onClick={handleSaveEvent}
                  disabled={isSaving}
                >
                  {isSaving ? "Guardando..." : isEditMode ? "Guardar cambios" : "Crear evento"}
                </button>
              </>
            ) : null}

            {createModalTab === "collections" ? (
              <>
                <select
                  className="auth-input"
                  value={collectionForm.event_id}
                  onChange={(event) =>
                    setCollectionForm((prev) => ({ ...prev, event_id: event.target.value }))
                  }
                >
                  <option value="">Selecciona un evento</option>
                  {events.map((eventItem) => (
                    <option key={eventItem.id} value={eventItem.id}>
                      {eventItem.name}
                    </option>
                  ))}
                </select>
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
                {renderImageControls("collection", collectionForm.image_url, (url) =>
                  setCollectionForm((prev) => ({ ...prev, image_url: url })),
                )}
                <button
                  className="access-button"
                  type="button"
                  onClick={handleSaveCollection}
                  disabled={isSaving}
                >
                  {isSaving ? "Guardando..." : isEditMode ? "Guardar cambios" : "Crear coleccion"}
                </button>
              </>
            ) : null}

            {createModalTab === "stamps" ? (
              <>
                <select
                  className="auth-input"
                  value={stampForm.collection_id}
                  onChange={(event) =>
                    setStampForm((prev) => ({ ...prev, collection_id: event.target.value }))
                  }
                >
                  <option value="">Selecciona una coleccion</option>
                  {collections.map((collectionItem) => (
                    <option key={collectionItem.id} value={collectionItem.id}>
                      {collectionItem.name}
                    </option>
                  ))}
                </select>
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
                {renderImageControls("stamp", stampForm.image_url, (url) =>
                  setStampForm((prev) => ({ ...prev, image_url: url })),
                )}
                <button
                  className="access-button"
                  type="button"
                  onClick={handleSaveStamp}
                  disabled={isSaving}
                >
                  {isSaving ? "Guardando..." : isEditMode ? "Guardar cambios" : "Crear stamp"}
                </button>
              </>
            ) : null}

            {createModalTab === "gallery" ? (
              <>
                <label className="admin-file-label admin-file-label-full">
                  {galleryForm.file ? galleryForm.file.name : "Seleccionar imagen"}
                  <input
                    className="admin-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      setGalleryForm((prev) => ({
                        ...prev,
                        file: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </label>
                <button
                  className="access-button"
                  type="button"
                  onClick={handleCreateGalleryImage}
                  disabled={isSaving}
                >
                  {isSaving ? "Subiendo..." : "Subir imagen"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteModal = () => {
    if (!deleteTarget) return null;

    return (
      <div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
        <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
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
            Seguro que quieres borrar <strong>{deleteTarget.name}</strong>?
          </p>
          <div className="admin-confirm-actions">
            <button type="button" className="admin-mini-btn" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="admin-mini-btn admin-mini-btn-danger-solid"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving ? "Borrando..." : "Borrar"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAwardModal = () => {
    if (!awardTarget) return null;

    return (
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
          <div className="admin-award-preview">
            {awardTarget.stampImageUrl ? (
              <img
                src={awardTarget.stampImageUrl}
                alt={awardTarget.stampName}
                className="admin-award-thumb"
              />
            ) : (
              <div className="admin-stamp-placeholder admin-award-thumb">Sin imagen</div>
            )}
            <div className="admin-award-copy">
              <p className="admin-item-name">{awardTarget.stampName}</p>
              <p className="admin-muted admin-muted-small">{awardTarget.collectionName}</p>
              <p className="admin-muted admin-muted-small">{awardTarget.eventName}</p>
            </div>
          </div>
          <div className="admin-award-form">
            <input
              className="auth-input"
              placeholder="Codigo de entrenador"
              value={trainerCodeInput}
              onChange={(event) => setTrainerCodeInput(event.target.value)}
            />
            <div className="admin-award-helper-row">
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
              <div className="admin-award-trainer-state">
                {trainerLookup.loading ? (
                  <span className="admin-muted admin-muted-small">Buscando entrenador...</span>
                ) : null}
                {trainerLookup.name ? (
                  <span className="admin-award-trainer-name">{trainerLookup.name}</span>
                ) : null}
                {trainerLookup.error ? (
                  <span className="auth-error admin-award-inline-error">
                    {trainerLookup.error}
                  </span>
                ) : null}
              </div>
            </div>
            {isScannerOpen ? (
              <div className="admin-scanner-panel">
                <video ref={videoRef} className="admin-scanner-video" muted playsInline />
                <p className="admin-muted admin-muted-small">
                  Enfoca el QR del codigo de entrenador.
                </p>
                {scannerError ? (
                  <p className="auth-error admin-award-inline-error">{scannerError}</p>
                ) : null}
              </div>
            ) : null}
            <button
              className="access-button"
              type="button"
              onClick={handleAwardStamp}
              disabled={isSaving || !trainerCodeInput.trim() || !trainerLookup.userId}
            >
              {isSaving ? "Guardando..." : "Entregar stamp"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const filteredEvents = events.filter((eventItem) => {
    if (!eventSearch) return true;
    const haystack = [
      eventItem.name,
      eventItem.description ?? "",
      eventItem.starts_at,
      eventItem.ends_at ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(eventSearch);
  });

  const filteredCollections = collections.filter((collectionItem) => {
    if (!collectionSearch) return true;
    const eventName =
      events.find((eventItem) => eventItem.id === collectionItem.event_id)?.name ?? "";
    const haystack = [
      collectionItem.name,
      collectionItem.description ?? "",
      eventName,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(collectionSearch);
  });

  const filteredStamps = stamps.filter((stampItem) => {
    if (!stampSearch) return true;
    const collectionName =
      collections.find((collectionItem) => collectionItem.id === stampItem.collection_id)?.name ??
      "";
    const haystack = [
      stampItem.name,
      stampItem.description ?? "",
      collectionName,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(stampSearch);
  });

  const filteredGalleryImages = imageOptions.filter((image) => {
    if (!gallerySearch) return true;
    const haystack = [image.label, image.folder, image.path].join(" ").toLowerCase();
    return haystack.includes(gallerySearch);
  });

  const filteredUsers = users.filter((userItem) => {
    if (!userSearch) return true;
    const haystack = [
      userItem.trainer_name,
      userItem.trainer_code,
      userItem.email ?? "",
      userItem.role,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(userSearch);
  });

  const renderGalleryPickerModal = () => {
    if (!openGalleryTarget) return null;

    const images = imageOptions;

    return (
      <div className="admin-modal-backdrop" onClick={() => setOpenGalleryTarget(null)}>
        <div
          className="admin-modal admin-modal-large"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="admin-modal-header">
            <div />
            <button
              type="button"
              className="admin-icon-close"
              onClick={() => setOpenGalleryTarget(null)}
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

          {images.length ? (
            <div className="admin-gallery admin-gallery-modal">
              {images.map((image) => (
                <button
                  key={image.path}
                  type="button"
                  className="admin-gallery-item"
                  onClick={() => handleGallerySelection(image.url)}
                >
                  <img src={image.url} alt={image.label} className="admin-gallery-thumb" />
                  <span className="admin-folder-chip">{image.folder}</span>
                  <span className="admin-gallery-label">{image.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="admin-muted">No hay imagenes disponibles en esta galeria.</p>
          )}
        </div>
      </div>
    );
  };

  if (state.loading) {
    return (
      <main className="admin-screen">
        <p className="admin-muted">Cargando...</p>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="admin-screen">
        <section className="admin-card">
          <h1 className="admin-title">Panel de Administracion</h1>
          <p className="admin-error">{state.error}</p>
          <button
            className="admin-back-button"
            type="button"
            onClick={() => router.push("/")}
          >
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-screen">
      <section className="admin-card">
        <h1 className="admin-title">Panel de Administracion</h1>
        <p className="admin-welcome">Bienvenida, {state.trainerName}</p>
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab ${activeTab === "events" ? "active" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            Eventos
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "collections" ? "active" : ""}`}
            onClick={() => setActiveTab("collections")}
          >
            Colecciones
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "stamps" ? "active" : ""}`}
            onClick={() => setActiveTab("stamps")}
          >
            Stamps
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => setActiveTab("gallery")}
          >
            Galeria
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            Usuarios
          </button>
        </div>

        <div className="admin-grid">
          {activeTab === "events" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en eventos"
                  value={searchTerms.events}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, events: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="admin-mini-btn admin-mini-btn-primary"
                  onClick={() => openCreateModal("events")}
                >
                  Nuevo
                </button>
              </div>
              <ul className="admin-list">
                {filteredEvents.map((eventItem) => (
                  <li key={eventItem.id} className="admin-item">
                    <div className="admin-item-header">
                      <button
                        type="button"
                        className={`admin-select ${selectedEventId === eventItem.id ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedEventId(eventItem.id);
                          setExpandedEventId((prev) => (prev === eventItem.id ? null : eventItem.id));
                        }}
                      >
                        {eventItem.image_url ? (
                          <img
                            src={eventItem.image_url}
                            alt={eventItem.name}
                            className="admin-inline-thumb"
                          />
                        ) : null}
                        <span
                          className={`admin-status-dot ${eventIdsWithCollections.includes(eventItem.id) ? "enabled" : "disabled"}`}
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
                          onClick={() => openEditModal("event", eventItem.id)}
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
                          onClick={() =>
                            setDeleteTarget({ type: "event", id: eventItem.id, name: eventItem.name })
                          }
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
                        <p className="admin-muted admin-muted-small">
                          Inicio: {eventItem.starts_at}
                        </p>
                        <p className="admin-muted admin-muted-small">
                          Fin: {eventItem.ends_at ?? "Sin fecha de fin"}
                        </p>
                        {eventItem.description ? (
                          <p className="admin-muted admin-muted-small">{eventItem.description}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          {activeTab === "collections" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en colecciones"
                  value={searchTerms.collections}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, collections: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="admin-mini-btn admin-mini-btn-primary"
                  onClick={() => openCreateModal("collections")}
                >
                  Nuevo
                </button>
              </div>
              <ul className="admin-list">
                {filteredCollections.map((collectionItem) => (
                  <li key={collectionItem.id} className="admin-item">
                    <div className="admin-item-header">
                      <button
                        type="button"
                        className={`admin-select ${selectedCollectionId === collectionItem.id ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedCollectionId(collectionItem.id);
                          setExpandedCollectionId((prev) =>
                            prev === collectionItem.id ? null : collectionItem.id,
                          );
                        }}
                      >
                        {collectionItem.image_url ? (
                          <img
                            src={collectionItem.image_url}
                            alt={collectionItem.name}
                            className="admin-inline-thumb"
                          />
                        ) : null}
                        <span
                          className={`admin-status-dot ${collectionIdsWithStamps.includes(collectionItem.id) ? "enabled" : "disabled"}`}
                          aria-hidden="true"
                        />
                        <span className="admin-item-name">{collectionItem.name}</span>
                        <span className="admin-date-chip">
                          {events.find((eventItem) => eventItem.id === collectionItem.event_id)?.name ??
                            "Sin evento"}
                        </span>
                      </button>
                      <div className="admin-hover-actions">
                        <button
                          type="button"
                          className="admin-action-btn admin-action-btn-edit"
                          aria-label={`Editar ${collectionItem.name}`}
                          onClick={() => openEditModal("collection", collectionItem.id)}
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
                          onClick={() =>
                            setDeleteTarget({
                              type: "collection",
                              id: collectionItem.id,
                              name: collectionItem.name,
                            })
                          }
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
                          <p className="admin-muted admin-muted-small">
                            {collectionItem.description}
                          </p>
                        ) : null}
                        <div className="admin-expanded-stamps">
                          {stamps
                            .filter((stampItem) => stampItem.collection_id === collectionItem.id)
                            .map((stampItem) => (
                              <button
                                key={stampItem.id}
                                type="button"
                                className="admin-stamp-card"
                                onClick={() => openAwardModal(stampItem)}
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
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          {activeTab === "stamps" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en stamps"
                  value={searchTerms.stamps}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, stamps: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="admin-mini-btn admin-mini-btn-primary"
                  onClick={() => openCreateModal("stamps")}
                >
                  Nuevo
                </button>
              </div>
              <ul className="admin-stamps-grid">
                {filteredStamps.map((stampItem) => (
                  <li key={stampItem.id} className="admin-stamp-item">
                    <div className="admin-stamp-actions">
                        <button
                          type="button"
                          className="admin-action-btn admin-action-btn-edit"
                          aria-label={`Editar ${stampItem.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal("stamp", stampItem.id);
                          }}
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
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget({
                              type: "stamp",
                              id: stampItem.id,
                              name: stampItem.name,
                            });
                          }}
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
                      onClick={() => openAwardModal(stampItem)}
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
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          {activeTab === "gallery" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en galeria"
                  value={searchTerms.gallery}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, gallery: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="admin-mini-btn admin-mini-btn-primary"
                  onClick={() => openCreateModal("gallery")}
                >
                  Nuevo
                </button>
              </div>
              {filteredGalleryImages.length ? (
                <ul className="admin-gallery-grid">
                  {filteredGalleryImages.map((image) => (
                    <li key={image.path} className="admin-gallery-card">
                      <div className="admin-gallery-card-actions">
                        <button
                          type="button"
                          className="admin-action-btn admin-action-btn-delete"
                          aria-label={`Borrar ${image.label}`}
                          onClick={() =>
                            setDeleteTarget({
                              type: "gallery",
                              id: image.path,
                              name: image.label,
                            })
                          }
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                            <path
                              d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                      <img
                        src={image.url}
                        alt={image.label}
                        className="admin-gallery-card-thumb"
                      />
                      <div className="admin-gallery-card-body">
                        <span className="admin-folder-chip">{image.folder}</span>
                        <span className="admin-gallery-card-label">{image.label}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">No hay imagenes en el bucket.</p>
              )}
            </article>
          ) : null}

          {activeTab === "users" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en usuarios"
                  value={searchTerms.users}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, users: event.target.value }))
                  }
                />
              </div>
              {filteredUsers.length ? (
                <div className="admin-users-table-wrap">
                  <table className="admin-users-table">
                    <thead>
                      <tr>
                        <th>Trainer name</th>
                        <th>Trainer id</th>
                        <th>Email</th>
                        <th>Rol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((userItem) => (
                        <tr key={userItem.id}>
                          <td>{userItem.trainer_name}</td>
                          <td>{userItem.trainer_code}</td>
                          <td>{userItem.email ?? "-"}</td>
                          <td>{userItem.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="admin-muted">No hay usuarios para mostrar.</p>
              )}
            </article>
          ) : null}
        </div>
        {renderCreateModal()}
        {renderDeleteModal()}
        {renderAwardModal()}
        {renderGalleryPickerModal()}
      </section>
    </main>
  );
}
