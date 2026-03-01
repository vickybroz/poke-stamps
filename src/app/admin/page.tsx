"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppNavbar } from "@/components/app-navbar";

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
  name: string;
  description: string | null;
  image_url: string | null;
};

type StampItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};

type EventCollectionLink = {
  event_id: string;
  collection_id: string;
};

type CollectionStampLink = {
  collection_id: string;
  stamp_id: string;
};

type UserItem = {
  id: string;
  trainer_name: string;
  trainer_code: string;
  role: string;
  active: boolean;
};

type LogItem = {
  id: string;
  awarded_at: string;
  claim_code: string;
  event_name: string;
  collection_name: string;
  stamp_name: string;
  delivered_to: string;
  delivered_by: string;
};

type LogFilters = {
  awarded_at: string;
  stamp_name: string;
  collection_name: string;
  event_name: string;
  delivered_to: string;
  delivered_by: string;
  claim_code: string;
};

type AdminTab =
  | "events"
  | "collections"
  | "stamps"
  | "albums"
  | "gallery"
  | "users"
  | "logs";
type UploadTarget = "event" | "collection" | "stamp" | "user";
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
const LOGS_PAGE_SIZE = 20;
const MIN_SEARCH_LENGTH = 3;

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AdminState>({
    trainerName: null,
    error: null,
    loading: true,
    userId: null,
  });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [eventCollections, setEventCollections] = useState<EventCollectionLink[]>([]);
  const [collectionStamps, setCollectionStamps] = useState<CollectionStampLink[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsCount, setLogsCount] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
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
  const [isCollectionStampPickerOpen, setIsCollectionStampPickerOpen] = useState(false);
  const [collectionStampPickerSearch, setCollectionStampPickerSearch] = useState("");
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
    albums: "",
    gallery: "",
    users: "",
    logs: "",
  });
  const [logFilters, setLogFilters] = useState<LogFilters>({
    awarded_at: "",
    stamp_name: "",
    collection_name: "",
    event_name: "",
    delivered_to: "",
    delivered_by: "",
    claim_code: "",
  });
  const [eventForm, setEventForm] = useState({
    id: "",
    name: "",
    starts_at: "",
    ends_at: "",
    description: "",
    image_url: "",
    collection_ids: [] as string[],
  });
  const [collectionForm, setCollectionForm] = useState({
    id: "",
    name: "",
    description: "",
    image_url: "",
    event_ids: [] as string[],
    stamp_ids: [] as string[],
  });
  const [stampForm, setStampForm] = useState({
    id: "",
    name: "",
    description: "",
    image_url: "",
  });
  const [userForm, setUserForm] = useState({
    id: "",
    trainer_name: "",
    trainer_code: "",
    role: "user",
    active: true,
  });
  const [galleryForm, setGalleryForm] = useState<{
    file: File | null;
  }>({
    file: null,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getActiveSearchTerm = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized.length >= MIN_SEARCH_LENGTH ? normalized : "";
  };

  const eventSearch = getActiveSearchTerm(searchTerms.events);
  const collectionSearch = getActiveSearchTerm(searchTerms.collections);
  const stampSearch = getActiveSearchTerm(searchTerms.stamps);
  const albumSearch = getActiveSearchTerm(searchTerms.albums);
  const gallerySearch = getActiveSearchTerm(searchTerms.gallery);
  const userSearch = getActiveSearchTerm(searchTerms.users);
  const appliedLogFilters = useMemo(
    () => ({
      awarded_at: logFilters.awarded_at,
      stamp_name: getActiveSearchTerm(logFilters.stamp_name),
      collection_name: getActiveSearchTerm(logFilters.collection_name),
      event_name: getActiveSearchTerm(logFilters.event_name),
      delivered_to: getActiveSearchTerm(logFilters.delivered_to),
      delivered_by: getActiveSearchTerm(logFilters.delivered_by),
      claim_code: getActiveSearchTerm(logFilters.claim_code),
    }),
    [logFilters],
  );
  const queryTabParam = searchParams.get("tab");
  const queryIdParam = searchParams.get("id");
  const queryEventIdParam = searchParams.get("eventId");
  const queryTab: AdminTab | null =
    queryTabParam === "events" ||
    queryTabParam === "collections" ||
    queryTabParam === "stamps" ||
    queryTabParam === "albums" ||
    queryTabParam === "gallery" ||
    queryTabParam === "users" ||
    queryTabParam === "logs"
      ? queryTabParam
      : null;

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
    const { data } = await supabase.from("event_collections").select("event_id");
    const ids = Array.from(
      new Set(
        ((data as Array<{ event_id: string }> | null) ?? []).map((item) => item.event_id),
      ),
    );
    setEventIdsWithCollections(ids);
  };

  const reloadStampSummary = async () => {
    const { data } = await supabase.from("collection_stamps").select("collection_id");
    const ids = Array.from(
      new Set(
        ((data as Array<{ collection_id: string }> | null) ?? []).map(
          (item) => item.collection_id,
        ),
      ),
    );
    setCollectionIdsWithStamps(ids);
  };

  const loadEventCollections = async () => {
    const { data } = await supabase
      .from("event_collections")
      .select("event_id, collection_id");

    setEventCollections((data as EventCollectionLink[] | null) ?? []);
  };

  const loadCollectionStamps = async () => {
    const { data } = await supabase
      .from("collection_stamps")
      .select("collection_id, stamp_id");

    setCollectionStamps((data as CollectionStampLink[] | null) ?? []);
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
      .select("id, name, description, image_url")
      .order("created_at", { ascending: false });

    setCollections((data as CollectionItem[] | null) ?? []);
  };

  const loadStamps = async () => {
    const { data } = await supabase
      .from("stamps")
      .select("id, name, description, image_url")
      .order("created_at", { ascending: false });

    setStamps((data as StampItem[] | null) ?? []);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, trainer_name, trainer_code, role, active")
      .order("trainer_name", { ascending: true });

    setUsers((data as UserItem[] | null) ?? []);
  };

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);

    const resolveNameFilterIds = async (
      table: "events" | "collections" | "stamps" | "profiles",
      value: string,
    ) => {
      const term = value.trim();

      if (term.length < MIN_SEARCH_LENGTH) {
        return null;
      }

      const column = table === "profiles" ? "trainer_name" : "name";
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .ilike(column, `%${term}%`)
        .limit(200);

      if (error) {
        throw error;
      }

      return ((data as Array<{ id: string }> | null) ?? []).map((item) => item.id);
    };

    try {
      const [
        eventIds,
        collectionIds,
        stampIds,
        deliveredToIds,
        deliveredByIds,
      ] = await Promise.all([
        resolveNameFilterIds("events", appliedLogFilters.event_name),
        resolveNameFilterIds("collections", appliedLogFilters.collection_name),
        resolveNameFilterIds("stamps", appliedLogFilters.stamp_name),
        resolveNameFilterIds("profiles", appliedLogFilters.delivered_to),
        resolveNameFilterIds("profiles", appliedLogFilters.delivered_by),
      ]);

      if (
        (eventIds && !eventIds.length) ||
        (collectionIds && !collectionIds.length) ||
        (stampIds && !stampIds.length) ||
        (deliveredToIds && !deliveredToIds.length) ||
        (deliveredByIds && !deliveredByIds.length)
      ) {
        setLogs([]);
        setLogsCount(0);
        return;
      }

      let query = supabase
        .from("user_stamps")
        .select(
          "id, awarded_at, claim_code, user_id, awarded_by, event:events(name), collection:collections(name), stamp:stamps(name)",
          { count: "exact" },
        )
        .order("awarded_at", { ascending: false });

      const claimCodeTerm = appliedLogFilters.claim_code.trim();

      if (claimCodeTerm.length >= MIN_SEARCH_LENGTH) {
        query = query.ilike("claim_code", `%${claimCodeTerm}%`);
      }

      if (appliedLogFilters.awarded_at) {
        const dayStart = `${appliedLogFilters.awarded_at}T00:00:00`;
        const nextDay = new Date(`${appliedLogFilters.awarded_at}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayIso = nextDay.toISOString().slice(0, 19);

        query = query.gte("awarded_at", dayStart).lt("awarded_at", nextDayIso);
      }

      if (eventIds) {
        query = query.in("event_id", eventIds);
      }
      if (collectionIds) {
        query = query.in("collection_id", collectionIds);
      }
      if (stampIds) {
        query = query.in("stamp_id", stampIds);
      }
      if (deliveredToIds) {
        query = query.in("user_id", deliveredToIds);
      }
      if (deliveredByIds) {
        query = query.in("awarded_by", deliveredByIds);
      }

      const from = (logsPage - 1) * LOGS_PAGE_SIZE;
      const to = from + LOGS_PAGE_SIZE - 1;
      const { data, error, count } = await query.range(from, to);

      if (error) {
        throw error;
      }

      const rows =
        ((data as Array<{
          id: string;
          awarded_at: string;
          claim_code: string;
          user_id: string;
          awarded_by: string | null;
          event: { name: string } | Array<{ name: string }> | null;
          collection: { name: string } | Array<{ name: string }> | null;
          stamp: { name: string } | Array<{ name: string }> | null;
        }> | null) ?? []);

      const profileIds = Array.from(
        new Set(
          rows.flatMap((row) => [row.user_id, row.awarded_by].filter(Boolean) as string[]),
        ),
      );

      const { data: profileRows, error: profileError } = profileIds.length
        ? await supabase
            .from("profiles")
            .select("id, trainer_name")
            .in("id", profileIds)
        : { data: [], error: null };

      if (profileError) {
        throw profileError;
      }

      const profileMap = new Map(
        (((profileRows as Array<{ id: string; trainer_name: string }> | null) ?? [])).map(
          (item) => [item.id, item.trainer_name],
        ),
      );

      const getRelationName = (
        relation: { name: string } | Array<{ name: string }> | null,
      ) => {
        if (!relation) return "-";
        return Array.isArray(relation) ? relation[0]?.name ?? "-" : relation.name;
      };

      setLogs(
        rows.map((row) => ({
          id: row.id,
          awarded_at: row.awarded_at,
          claim_code: row.claim_code,
          event_name: getRelationName(row.event),
          collection_name: getRelationName(row.collection),
          stamp_name: getRelationName(row.stamp),
          delivered_to: profileMap.get(row.user_id) ?? "-",
          delivered_by: row.awarded_by ? profileMap.get(row.awarded_by) ?? "-" : "-",
        })),
      );
      setLogsCount(count ?? 0);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudieron cargar los logs.");
      setLogs([]);
      setLogsCount(0);
    } finally {
      setLogsLoading(false);
    }
  }, [appliedLogFilters, logsPage]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      loadEvents(),
      loadCollections(),
      loadStamps(),
      loadEventCollections(),
      loadCollectionStamps(),
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
      collection_ids: [],
    });
    setCollectionForm({
      id: "",
      name: "",
      description: "",
      image_url: "",
      event_ids: selectedEventId ? [selectedEventId] : [],
      stamp_ids: [],
    });
    setStampForm({
      id: "",
      name: "",
      description: "",
      image_url: "",
    });
    setUserForm({
      id: "",
      trainer_name: "",
      trainer_code: "",
      role: "user",
      active: true,
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
    setIsCollectionStampPickerOpen(false);
    resetModalState();
  };


  const openAwardModalWithContext = (
    stampItem: StampItem,
    collectionId: string,
    eventId: string,
  ) => {
    const collection = collections.find((item) => item.id === collectionId);
    const event = events.find((item) => item.id === eventId);

    if (!collection || !event) {
      setFeedback("No se pudo resolver la coleccion o el evento de esta stamp.");
      return;
    }

    setSelectedCollectionId(collectionId);
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
        collection_ids: eventCollections
          .filter((link) => link.event_id === item.id)
          .map((link) => link.collection_id),
      });
      setCreateModalTab("events");
      return;
    }

    if (target === "collection") {
      const item = collections.find((collectionItem) => collectionItem.id === id);
      if (!item) return;
      const relatedEventIds = eventCollections
        .filter((link) => link.collection_id === item.id)
        .map((link) => link.event_id);
      const relatedStampIds = collectionStamps
        .filter((link) => link.collection_id === item.id)
        .map((link) => link.stamp_id);
      setCollectionForm({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        image_url: item.image_url ?? "",
        event_ids: relatedEventIds,
        stamp_ids: relatedStampIds,
      });
      setCreateModalTab("collections");
      return;
    }

    if (target === "stamp") {
      const item = stamps.find((stampItem) => stampItem.id === id);
      if (!item) return;
      setStampForm({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        image_url: item.image_url ?? "",
      });
      setCreateModalTab("stamps");
      return;
    }

    const item = users.find((userItem) => userItem.id === id);
    if (!item) return;
    setUserForm({
      id: item.id,
      trainer_name: item.trainer_name,
      trainer_code: item.trainer_code,
      role: item.role,
      active: item.active,
    });
    setCreateModalTab("users");
  };

  useEffect(() => {
    const loadAdminProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.push("/");
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

      if (profile.role !== "admin" && profile.role !== "mod") {
        router.push("/user");
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
  }, [reloadAll, router]);

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

            const digitsOnly = rawValue.replace(/\D/g, "");
            const normalizedCode = digitsOnly.slice(-12);

            if (normalizedCode.length !== 12) {
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

  const syncEventCollections = async (eventId: string, collectionIds: string[]) => {
    const uniqueCollectionIds = Array.from(new Set(collectionIds.filter(Boolean)));

    const { error: deleteError } = await supabase
      .from("event_collections")
      .delete()
      .eq("event_id", eventId);

    if (deleteError) {
      throw deleteError;
    }

    if (!uniqueCollectionIds.length || !state.userId) {
      return;
    }

    const { error: insertError } = await supabase.from("event_collections").insert(
      uniqueCollectionIds.map((collectionId) => ({
        event_id: eventId,
        collection_id: collectionId,
        created_by: state.userId,
      })),
    );

    if (insertError) {
      throw insertError;
    }
  };

  const syncCollectionRelations = async (
    collectionId: string,
    eventIds: string[],
    stampIds: string[],
  ) => {
    const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
    const uniqueStampIds = Array.from(new Set(stampIds.filter(Boolean)));

    const { error: deleteEventLinksError } = await supabase
      .from("event_collections")
      .delete()
      .eq("collection_id", collectionId);

    if (deleteEventLinksError) {
      throw deleteEventLinksError;
    }

    const { error: deleteStampLinksError } = await supabase
      .from("collection_stamps")
      .delete()
      .eq("collection_id", collectionId);

    if (deleteStampLinksError) {
      throw deleteStampLinksError;
    }

    if (state.userId && uniqueEventIds.length) {
      const { error: insertEventLinksError } = await supabase.from("event_collections").insert(
        uniqueEventIds.map((eventId) => ({
          event_id: eventId,
          collection_id: collectionId,
          created_by: state.userId,
        })),
      );

      if (insertEventLinksError) {
        throw insertEventLinksError;
      }
    }

    if (state.userId && uniqueStampIds.length) {
      const { error: insertStampLinksError } = await supabase.from("collection_stamps").insert(
        uniqueStampIds.map((stampId) => ({
          collection_id: collectionId,
          stamp_id: stampId,
          created_by: state.userId,
        })),
      );

      if (insertStampLinksError) {
        throw insertStampLinksError;
      }
    }
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
    if (!state.userId || !collectionForm.name) {
      setFeedback("Completa el nombre de la coleccion.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: collectionForm.name,
        description: collectionForm.description || null,
        image_url: collectionForm.image_url || null,
        created_by: state.userId,
      };
      let collectionId = collectionForm.id;

      if (collectionForm.id) {
        const { error } = await supabase
          .from("collections")
          .update(payload)
          .eq("id", collectionForm.id);
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

      await syncCollectionRelations(
        collectionId,
        collectionForm.event_ids,
        collectionForm.stamp_ids,
      );

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
    if (!state.userId || !stampForm.name) {
      setFeedback("Completa el nombre.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
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

  const handleSaveUser = async () => {
    if (!userForm.id || !userForm.trainer_name.trim() || !userForm.trainer_code.trim()) {
      setFeedback("Completa el nombre y el codigo del entrenador.");
      return;
    }

    if (userForm.role !== "user" && userForm.role !== "mod") {
      setFeedback("Solo puedes asignar los roles user o mod.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          trainer_name: userForm.trainer_name.trim(),
          trainer_code: userForm.trainer_code.trim(),
          role: userForm.role,
          active: userForm.active,
        })
        .eq("id", userForm.id);

      if (error) throw error;

      await reloadAll();
      setFeedback("Usuario actualizado.");
      closeCreateModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
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
      if (deleteTarget.type === "user") {
        const { error } = await supabase.rpc("admin_delete_user", {
          target_user_id: deleteTarget.id,
        });
        if (error) throw error;
      }

      await reloadAll();
      setLogsRefreshKey((current) => current + 1);
      setFeedback("Item eliminado.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active: true })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      await loadUsers();
      setFeedback("Usuario autorizado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo autorizar el usuario.");
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
        const { data, error } = await supabase
          .from("user_stamps")
          .insert({
            user_id: trainerLookup.userId,
            stamp_id: awardTarget.stampId,
            collection_id: awardTarget.collectionId,
            event_id: awardTarget.eventId,
            awarded_by: state.userId,
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

        setLogsRefreshKey((current) => current + 1);
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

  useEffect(() => {
    if (!queryTab || !queryIdParam) {
      return;
    }

    setActiveTab(queryTab);

    if (queryTab === "events") {
      setSelectedEventId(queryIdParam);
      setExpandedEventId(queryIdParam);
      return;
    }

    if (queryTab === "collections") {
      setSelectedCollectionId(queryIdParam);
      setExpandedCollectionId(queryIdParam);
      if (queryEventIdParam) {
        setSelectedEventId(queryEventIdParam);
      }
      return;
    }
  }, [queryEventIdParam, queryIdParam, queryTab]);

  useEffect(() => {
    if (activeTab !== "logs") {
      return;
    }

    void loadLogs();
  }, [activeTab, loadLogs, logsRefreshKey]);

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
                {renderImageControls("collection", collectionForm.image_url, (url) =>
                  setCollectionForm((prev) => ({ ...prev, image_url: url })),
                )}
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
                      onClick={() => setIsCollectionStampPickerOpen(true)}
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

            {createModalTab === "users" ? (
              <>
                <input
                  className="auth-input"
                  placeholder="Nombre de entrenador"
                  value={userForm.trainer_name}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, trainer_name: event.target.value }))
                  }
                />
                <input
                  className="auth-input"
                  placeholder="Codigo de entrenador"
                  value={userForm.trainer_code}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, trainer_code: event.target.value }))
                  }
                />
                <select
                  className="auth-input"
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  <option value="user">user</option>
                  <option value="mod">mod</option>
                </select>
                <label className="admin-check-item">
                  <input
                    type="checkbox"
                    checked={userForm.active}
                    onChange={(event) =>
                      setUserForm((prev) => ({ ...prev, active: event.target.checked }))
                    }
                  />
                  <span>Usuario habilitado</span>
                </label>
                <button
                  className="access-button"
                  type="button"
                  onClick={handleSaveUser}
                  disabled={isSaving}
                >
                  {isSaving ? "Guardando..." : "Guardar cambios"}
                </button>
              </>
            ) : null}

            {createModalTab === "stamps" ? (
              <>
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

  const renderCollectionStampPickerModal = () => {
    if (!isCollectionStampPickerOpen) {
      return null;
    }

    const stampSearch = getActiveSearchTerm(collectionStampPickerSearch);
    const filteredStampOptions = stamps.filter((stampItem) => {
      if (!stampSearch) return true;

      return [stampItem.name, stampItem.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(stampSearch);
    });

    return (
      <div
        className="admin-modal-backdrop"
        onClick={() => setIsCollectionStampPickerOpen(false)}
      >
        <div
          className="admin-modal admin-modal-large"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="admin-modal-header">
            <h2 className="admin-box-title">Agregar stamps a la coleccion</h2>
            <button
              type="button"
              className="admin-icon-close"
              onClick={() => setIsCollectionStampPickerOpen(false)}
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
            value={collectionStampPickerSearch}
            onChange={(event) => setCollectionStampPickerSearch(event.target.value)}
          />

          <div className="admin-stamp-select-grid">
            {filteredStampOptions.length ? (
              filteredStampOptions.map((stampItem) => (
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
    );
  };

  const getEventCollectionIds = (eventId: string) =>
    eventCollections
      .filter((link) => link.event_id === eventId)
      .map((link) => link.collection_id);

  const getCollectionEventIds = (collectionId: string) =>
    eventCollections
      .filter((link) => link.collection_id === collectionId)
      .map((link) => link.event_id);

  const getCollectionStampIds = (collectionId: string) =>
    collectionStamps
      .filter((link) => link.collection_id === collectionId)
      .map((link) => link.stamp_id);

  const filteredEvents = events.filter((eventItem) => {
    if (queryTab === "events" && queryIdParam) {
      return eventItem.id === queryIdParam;
    }

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
    if (queryTab === "collections" && queryIdParam) {
      return collectionItem.id === queryIdParam;
    }

    if (selectedEventId && !getEventCollectionIds(selectedEventId).includes(collectionItem.id)) {
      return false;
    }

    if (!collectionSearch) return true;
    const eventNames = getCollectionEventIds(collectionItem.id)
      .map((eventId) => events.find((eventItem) => eventItem.id === eventId)?.name ?? "")
      .join(" ");
    const haystack = [
      collectionItem.name,
      collectionItem.description ?? "",
      eventNames,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(collectionSearch);
  });

  const filteredStamps = stamps.filter((stampItem) => {
    if (queryTab === "stamps" && queryIdParam) {
      return stampItem.id === queryIdParam;
    }

    if (selectedCollectionId && !getCollectionStampIds(selectedCollectionId).includes(stampItem.id)) {
      return false;
    }

    if (!stampSearch) return true;
    const collectionNames = collectionStamps
      .filter((link) => link.stamp_id === stampItem.id)
      .map((link) => collections.find((collectionItem) => collectionItem.id === link.collection_id)?.name ?? "")
      .join(" ");
    const haystack = [
      stampItem.name,
      stampItem.description ?? "",
      collectionNames,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(stampSearch);
  });

  const filteredGalleryImages = imageOptions.filter((image) => {
    if (queryTab === "gallery" && queryIdParam) {
      return image.path === queryIdParam;
    }

    if (!gallerySearch) return true;
    const haystack = [image.label, image.folder, image.path].join(" ").toLowerCase();
    return haystack.includes(gallerySearch);
  });

  const filteredUsers = users.filter((userItem) => {
    if (queryTab === "users" && queryIdParam) {
      return userItem.id === queryIdParam;
    }

    if (!userSearch) return true;
    const haystack = [
      userItem.trainer_name,
      userItem.trainer_code,
      userItem.role,
      userItem.active ? "activo" : "pendiente",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(userSearch);
  });

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);

    if (tab !== "events") {
      setSelectedEventId(null);
    }

    if (tab !== "collections") {
      setSelectedCollectionId(null);
    }

    if (tab !== "events" && tab !== "albums") {
      setExpandedEventId(null);
    }

    if (tab !== "collections") {
      setExpandedCollectionId(null);
    }
  };

  const formatLogDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const totalLogPages = Math.max(1, Math.ceil(logsCount / LOGS_PAGE_SIZE));

  const filteredAlbumEvents = events.filter((eventItem) => {
    if (!albumSearch) return true;

    const relatedCollections = collections.filter((collectionItem) =>
      getEventCollectionIds(eventItem.id).includes(collectionItem.id),
    );
    const relatedStampNames = relatedCollections
      .flatMap((collectionItem) =>
        stamps
          .filter((stampItem) => getCollectionStampIds(collectionItem.id).includes(stampItem.id))
          .map((stampItem) => stampItem.name),
      )
      .join(" ");

    const haystack = [
      eventItem.name,
      eventItem.description ?? "",
      relatedCollections.map((collectionItem) => collectionItem.name).join(" "),
      relatedStampNames,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(albumSearch);
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
      <AppNavbar />
      <section className="admin-card">
        <h1 className="admin-title">Panel de Administracion</h1>
        <p className="admin-welcome">Bienvenida, {state.trainerName}</p>
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab ${activeTab === "events" ? "active" : ""}`}
            onClick={() => handleTabChange("events")}
          >
            Eventos
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "collections" ? "active" : ""}`}
            onClick={() => handleTabChange("collections")}
          >
            Colecciones
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "stamps" ? "active" : ""}`}
            onClick={() => handleTabChange("stamps")}
          >
            Stamps
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "albums" ? "active" : ""}`}
            onClick={() => handleTabChange("albums")}
          >
            Albumes
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => handleTabChange("gallery")}
          >
            Galeria
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "users" ? "active" : ""}`}
            onClick={() => handleTabChange("users")}
          >
            Usuarios
          </button>
          <button
            type="button"
            className={`admin-tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => handleTabChange("logs")}
          >
            Logs
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
                        {eventItem.description ? (
                          <p className="admin-muted admin-muted-small">{eventItem.description}</p>
                        ) : null}
                        <p className="admin-muted admin-muted-small">
                          {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fecha de fin"}
                        </p>
                        <div className="admin-event-collections">
                          {getEventCollectionIds(eventItem.id).length ? (
                            <ul className="admin-inline-list">
                              {collections
                                .filter((collectionItem) =>
                                  getEventCollectionIds(eventItem.id).includes(collectionItem.id),
                                )
                                .map((collectionItem) => (
                                  <li key={collectionItem.id} className="admin-inline-list-item">
                                    <button
                                      type="button"
                                      className="admin-inline-link"
                                      onClick={() =>
                                        router.push(
                                          `/admin?tab=collections&id=${collectionItem.id}&eventId=${eventItem.id}`,
                                        )
                                      }
                                    >
                                      {collectionItem.name}
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          ) : (
                            <p className="admin-muted admin-muted-small">
                              No tiene colecciones asignadas.
                            </p>
                          )}
                        </div>
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
                        <p className="admin-muted admin-muted-small">
                          Eventos:{" "}
                          {getCollectionEventIds(collectionItem.id)
                            .map((eventId) => events.find((eventItem) => eventItem.id === eventId)?.name)
                            .filter(Boolean)
                            .join(", ") || "Sin eventos"}
                        </p>
                        <div className="admin-expanded-stamps">
                          {stamps
                            .filter((stampItem) =>
                              getCollectionStampIds(collectionItem.id).includes(stampItem.id),
                            )
                            .map((stampItem) => (
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
                          {getCollectionEventIds(collectionItem.id).length ? (
                            getCollectionEventIds(collectionItem.id).map((eventId) => {
                              const relatedEvent = events.find((eventItem) => eventItem.id === eventId);
                              if (!relatedEvent) return null;

                              return (
                                <button
                                  key={eventId}
                                  type="button"
                                  className="admin-date-chip admin-date-chip-link"
                                  onClick={() => router.push(`/admin?tab=events&id=${eventId}`)}
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
                      onClick={() => openEditModal("stamp", stampItem.id)}
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

          {activeTab === "albums" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <input
                  className="admin-search-input"
                  type="search"
                  placeholder="Buscar en albumes"
                  value={searchTerms.albums}
                  onChange={(event) =>
                    setSearchTerms((prev) => ({ ...prev, albums: event.target.value }))
                  }
                />
              </div>
              <ul className="admin-list">
                {filteredAlbumEvents.map((eventItem) => {
                  const albumCollections = collections.filter((collectionItem) =>
                    getEventCollectionIds(eventItem.id).includes(collectionItem.id),
                  );

                  return (
                    <li key={eventItem.id} className="admin-item">
                      <div className="admin-item-header">
                        <button
                          type="button"
                          className={`admin-select ${expandedEventId === eventItem.id ? "selected" : ""}`}
                          onClick={() =>
                            setExpandedEventId((prev) => (prev === eventItem.id ? null : eventItem.id))
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
                                const albumStamps = stamps.filter((stampItem) =>
                                  getCollectionStampIds(collectionItem.id).includes(stampItem.id),
                                );

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
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((userItem) => (
                        <tr key={userItem.id}>
                          <td>{userItem.trainer_name}</td>
                          <td>{userItem.trainer_code}</td>
                          <td>{userItem.role}</td>
                          <td>{userItem.active ? "Activo" : "Pendiente"}</td>
                          <td>
                            {userItem.role !== "admin" ? (
                              <div className="admin-users-actions">
                                {!userItem.active ? (
                                  <button
                                    type="button"
                                    className="admin-mini-btn admin-mini-btn-primary"
                                    onClick={() => handleApproveUser(userItem.id)}
                                    disabled={isSaving}
                                  >
                                    Autorizar
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="admin-action-btn admin-action-btn-edit"
                                  aria-label={`Editar ${userItem.trainer_name}`}
                                  onClick={() => openEditModal("user", userItem.id)}
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
                                  aria-label={`Borrar ${userItem.trainer_name}`}
                                  onClick={() =>
                                    setDeleteTarget({
                                      type: "user",
                                      id: userItem.id,
                                      name: userItem.trainer_name,
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
                            ) : (
                              "-"
                            )}
                          </td>
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

          {activeTab === "logs" ? (
            <article className="admin-box">
              <div className="admin-box-header">
                <div className="admin-log-filters">
                  <input
                    className="admin-search-input"
                    type="date"
                    value={logFilters.awarded_at}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, awarded_at: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Stamp"
                    value={logFilters.stamp_name}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, stamp_name: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Coleccion"
                    value={logFilters.collection_name}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, collection_name: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Evento"
                    value={logFilters.event_name}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, event_name: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Entregada a"
                    value={logFilters.delivered_to}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, delivered_to: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Entregada por"
                    value={logFilters.delivered_by}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, delivered_by: event.target.value }));
                    }}
                  />
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="Claim code"
                    value={logFilters.claim_code}
                    onChange={(event) => {
                      setLogsPage(1);
                      setLogFilters((prev) => ({ ...prev, claim_code: event.target.value }));
                    }}
                  />
                </div>
              </div>
              {logsLoading ? (
                <p className="admin-muted">Cargando logs...</p>
              ) : logs.length ? (
                <>
                  <div className="admin-users-table-wrap">
                    <table className="admin-users-table">
                      <thead>
                        <tr>
                          <th>Fecha de entrega</th>
                          <th>Stamp</th>
                          <th>De la coleccion</th>
                          <th>En el evento</th>
                          <th>Entregada a</th>
                          <th>Entregada por</th>
                          <th>Claim code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((logItem) => (
                          <tr key={logItem.id}>
                            <td>{formatLogDate(logItem.awarded_at)}</td>
                            <td>{logItem.stamp_name}</td>
                            <td>{logItem.collection_name}</td>
                            <td>{logItem.event_name}</td>
                            <td>{logItem.delivered_to}</td>
                            <td>{logItem.delivered_by}</td>
                            <td>{logItem.claim_code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="admin-log-pagination">
                    <button
                      type="button"
                      className="admin-mini-btn"
                      onClick={() => setLogsPage((current) => Math.max(1, current - 1))}
                      disabled={logsPage === 1}
                    >
                      Anterior
                    </button>
                    <span className="admin-muted admin-muted-small">
                      Pagina {logsPage} de {totalLogPages}
                    </span>
                    <button
                      type="button"
                      className="admin-mini-btn"
                      onClick={() =>
                        setLogsPage((current) => Math.min(totalLogPages, current + 1))
                      }
                      disabled={logsPage >= totalLogPages}
                    >
                      Siguiente
                    </button>
                  </div>
                </>
              ) : (
                <p className="admin-muted">No hay logs para mostrar.</p>
              )}
            </article>
          ) : null}
        </div>
        {renderCreateModal()}
        {renderDeleteModal()}
        {renderAwardModal()}
        {renderCollectionStampPickerModal()}
        {renderGalleryPickerModal()}
      </section>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-screen">
          <section className="admin-card">
            <p className="admin-muted">Cargando...</p>
          </section>
        </main>
      }
    >
      <AdminPageContent />
    </Suspense>
  );
}







