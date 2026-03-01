"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase/client";
import { AppNavbar } from "@/components/app-navbar";

type UserState = {
  trainerName: string | null;
  error: string | null;
  loading: boolean;
  userId: string | null;
};

type UserStampRow = {
  event_id: string;
  collection_id: string;
  stamp_id: string;
  awarded_at: string;
  claim_code: string;
};

type EventItem = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  image_url: string | null;
  description: string | null;
};

type CollectionItem = {
  id: string;
  name: string;
  image_url: string | null;
};

type StampItem = {
  id: string;
  name: string;
  image_url: string | null;
};

type CollectionStampLink = {
  collection_id: string;
  stamp_id: string;
};

type SelectedUserStamp = {
  name: string;
  imageUrl: string | null;
  awardedAt: string;
  collectionName: string;
  eventName: string;
  claimCode: string;
};

export default function UserPage() {
  const router = useRouter();
  const [state, setState] = useState<UserState>({
    trainerName: null,
    error: null,
    loading: true,
    userId: null,
  });
  const [userStamps, setUserStamps] = useState<UserStampRow[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [collectionStamps, setCollectionStamps] = useState<CollectionStampLink[]>([]);
  const [selectedStamp, setSelectedStamp] = useState<SelectedUserStamp | null>(null);
  const [collapsedEvents, setCollapsedEvents] = useState<string[]>([]);
  const [collapsedCollections, setCollapsedCollections] = useState<string[]>([]);
  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [isModalVerifiedOpen, setIsModalVerifiedOpen] = useState(false);

  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.push("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("trainer_name, active")
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

      const { data: userStampData, error: userStampError } = await supabase
        .from("user_stamps")
        .select("event_id, collection_id, stamp_id, awarded_at, claim_code")
        .eq("user_id", userData.user.id)
        .order("awarded_at", { ascending: false });

      if (userStampError) {
        setState({
          trainerName: null,
          error: "No se pudieron cargar tus stamps.",
          loading: false,
          userId: null,
        });
        return;
      }

      const rows = (userStampData as UserStampRow[] | null) ?? [];
      const eventIds = Array.from(new Set(rows.map((row) => row.event_id)));
      const collectionIds = Array.from(new Set(rows.map((row) => row.collection_id)));

      const [eventsResponse, collectionsResponse, collectionStampsResponse] = await Promise.all([
        eventIds.length
          ? supabase
              .from("events")
              .select("id, name, starts_at, ends_at, image_url, description")
              .in("id", eventIds)
          : Promise.resolve({ data: [] }),
        collectionIds.length
          ? supabase.from("collections").select("id, name, image_url").in("id", collectionIds)
          : Promise.resolve({ data: [] }),
        collectionIds.length
          ? supabase
              .from("collection_stamps")
              .select("collection_id, stamp_id")
              .in("collection_id", collectionIds)
          : Promise.resolve({ data: [] }),
      ]);

      const relationRows =
        (collectionStampsResponse.data as CollectionStampLink[] | null) ?? [];
      const stampIds = Array.from(new Set(relationRows.map((row) => row.stamp_id)));

      const stampsResponse = stampIds.length
        ? await supabase.from("stamps").select("id, name, image_url").in("id", stampIds)
        : { data: [] };

      setState({
        trainerName: profile.trainer_name,
        error: null,
        loading: false,
        userId: userData.user.id,
      });
      setUserStamps(rows);
      setEvents((eventsResponse.data as EventItem[] | null) ?? []);
      setCollections((collectionsResponse.data as CollectionItem[] | null) ?? []);
      setCollectionStamps(relationRows);
      setStamps((stampsResponse.data as StampItem[] | null) ?? []);
    };

    void loadUserProfile();
  }, [router]);

  useEffect(() => {
    const claimCodes = Array.from(new Set(userStamps.map((row) => row.claim_code).filter(Boolean)));

    if (!claimCodes.length) {
      setQrCodeMap({});
      return;
    }

    let cancelled = false;

    const loadQRCodes = async () => {
      const entries = await Promise.all(
        claimCodes.map(async (claimCode) => {
          const qrUrl = await QRCode.toDataURL(claimCode, {
            margin: 1,
            width: 220,
            color: {
              dark: "#1d3c78",
              light: "#ffffff",
            },
          });

          return [claimCode, qrUrl] as const;
        }),
      );

      if (!cancelled) {
        setQrCodeMap(Object.fromEntries(entries));
      }
    };

    void loadQRCodes();

    return () => {
      cancelled = true;
    };
  }, [userStamps]);

  const eventGroups = useMemo(() => {
    return events
      .map((eventItem) => {
        const eventCollections = collections
          .filter((collectionItem) =>
            userStamps.some(
              (userStamp) =>
                userStamp.event_id === eventItem.id &&
                userStamp.collection_id === collectionItem.id,
            ),
          )
          .map((collectionItem) => {
            const collectionStampItems = stamps
              .filter((stampItem) =>
                collectionStamps.some(
                  (collectionStamp) =>
                    collectionStamp.collection_id === collectionItem.id &&
                    collectionStamp.stamp_id === stampItem.id,
                ),
              )
              .map((stampItem) => {
                const awardedStamp = userStamps.find(
                  (userStamp) =>
                    userStamp.event_id === eventItem.id &&
                    userStamp.collection_id === collectionItem.id &&
                    userStamp.stamp_id === stampItem.id,
                );

                return {
                  ...stampItem,
                  owned: Boolean(awardedStamp),
                  claimCode: awardedStamp?.claim_code ?? null,
                  awardedAt: awardedStamp?.awarded_at ?? null,
                };
              });

            return {
              ...collectionItem,
              stamps: collectionStampItems,
            };
          });

        return {
          ...eventItem,
          collections: eventCollections,
        };
      })
      .filter((eventItem) => eventItem.collections.length > 0);
  }, [collectionStamps, collections, events, stamps, userStamps]);

  const formatAwardedAt = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const toggleEvent = (eventId: string) => {
    setCollapsedEvents((current) =>
      current.includes(eventId)
        ? current.filter((item) => item !== eventId)
        : [...current, eventId],
    );
  };

  const toggleCollection = (collectionKey: string) => {
    setCollapsedCollections((current) =>
      current.includes(collectionKey)
        ? current.filter((item) => item !== collectionKey)
        : [...current, collectionKey],
    );
  };

  if (state.loading) {
    return (
      <main className="user-screen">
        <p className="admin-muted">Cargando...</p>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="user-screen">
        <section className="user-shell">
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
    <main className="user-screen">
      <AppNavbar />
      <section className="user-shell">
        <p className="admin-welcome">Bienvenida, {state.trainerName}</p>

        {eventGroups.length ? (
          <div className="user-album">
            {eventGroups.map((eventItem) => (
              <section key={eventItem.id} className="user-event-card">
                <button
                  className="user-event-header"
                  type="button"
                  onClick={() => toggleEvent(eventItem.id)}
                >
                  {eventItem.image_url ? (
                    <img
                      src={eventItem.image_url}
                      alt={eventItem.name}
                      className="user-event-thumb"
                    />
                  ) : null}
                  <div className="user-event-copy">
                    <h2 className="user-event-title">{eventItem.name}</h2>
                    {eventItem.description ? (
                      <p className="user-event-subtitle">{eventItem.description}</p>
                    ) : null}
                    <p className="user-event-date-chip user-event-date-chip-mobile">
                      {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fin"}
                    </p>
                  </div>
                  <p className="user-event-date-chip user-event-date-chip-desktop">
                    {eventItem.starts_at} - {eventItem.ends_at ?? "Sin fin"}
                  </p>
                </button>

                {!collapsedEvents.includes(eventItem.id) ? (
                  <div className="user-collections">
                    {eventItem.collections.map((collectionItem) => {
                      const collectionAccordionKey = `${eventItem.id}:${collectionItem.id}`;

                      return (
                        <article key={collectionAccordionKey} className="user-collection-card">
                          <button
                            className="user-collection-header"
                            type="button"
                            onClick={() => toggleCollection(collectionAccordionKey)}
                          >
                            <h3 className="user-collection-title">{collectionItem.name}</h3>
                            {collectionItem.image_url ? (
                              <img
                                src={collectionItem.image_url}
                                alt={collectionItem.name}
                                className="user-collection-thumb"
                              />
                            ) : null}
                          </button>

                          {!collapsedCollections.includes(collectionAccordionKey) ? (
                            <div className="user-stamps-grid">
                              {collectionItem.stamps.map((stampItem) => {
                                const claimCode = stampItem.claimCode;
                                const awardedAt = stampItem.awardedAt;

                                if (stampItem.owned && claimCode && awardedAt) {
                                  return (
                                    <button
                                      key={stampItem.id}
                                      className="user-stamp-slot owned"
                                      type="button"
                                      onClick={() => {
                                        setIsModalVerifiedOpen(false);
                                        setSelectedStamp({
                                          name: stampItem.name,
                                          imageUrl: stampItem.image_url,
                                          awardedAt,
                                          collectionName: collectionItem.name,
                                          eventName: eventItem.name,
                                          claimCode,
                                        });
                                      }}
                                    >
                                      {stampItem.image_url ? (
                                        <img
                                          src={stampItem.image_url}
                                          alt={stampItem.name}
                                          className="user-stamp-thumb"
                                        />
                                      ) : (
                                        <div className="user-stamp-thumb user-stamp-empty" />
                                      )}
                                      <span className="user-stamp-label">{stampItem.name}</span>
                                    </button>
                                  );
                                }

                                return (
                                  <div key={stampItem.id} className="user-stamp-slot missing">
                                    <div className="user-stamp-placeholder-box" />
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <p className="admin-muted">Todavia no tienes stamps activas.</p>
        )}

        {selectedStamp ? (
          <div
            className="admin-modal-backdrop"
            role="presentation"
            onClick={() => {
              setSelectedStamp(null);
              setIsModalVerifiedOpen(false);
            }}
          >
            <div
              className="admin-modal user-stamp-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-stamp-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="admin-modal-header">
                <h2 id="user-stamp-modal-title" className="admin-title">
                  {selectedStamp.name}
                </h2>
                <button
                  className="admin-icon-close"
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => {
                    setSelectedStamp(null);
                    setIsModalVerifiedOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="admin-icon-svg">
                    <path
                      fill="currentColor"
                      d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.3z"
                    />
                  </svg>
                </button>
              </div>

              <div className={`user-stamp-modal-flip ${isModalVerifiedOpen ? "flipped" : ""}`}>
                <div className="user-stamp-modal-face user-stamp-modal-front">
                  {selectedStamp.imageUrl ? (
                    <img
                      src={selectedStamp.imageUrl}
                      alt={selectedStamp.name}
                      className="user-stamp-modal-image"
                    />
                  ) : (
                    <div className="user-stamp-modal-image user-stamp-empty" />
                  )}
                  <button
                    type="button"
                    className="user-stamp-modal-verified"
                    onClick={() => setIsModalVerifiedOpen(true)}
                    aria-label="Verificar stamp"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 1.1 14.1 3l2.8-.3 1 2.6 2.7.9-.3 2.8 1.9 2.1-1.9 2.1.3 2.8-2.7.9-1 2.6-2.8-.3L12 22.9 9.9 21l-2.8.3-1-2.6-2.7-.9.3-2.8L1.8 13l1.9-2.1-.3-2.8 2.7-.9 1-2.6 2.8.3z"
                      />
                      <path
                        fill="#ffffff"
                        d="M10.25 16.35 6.9 13l1.55-1.55 1.8 1.8 5.3-5.3 1.55 1.55z"
                      />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  className="user-stamp-modal-face user-stamp-modal-back"
                  onClick={() => setIsModalVerifiedOpen(false)}
                  aria-label="Volver a la stamp"
                >
                  {qrCodeMap[selectedStamp.claimCode] ? (
                    <>
                      <img
                        src={qrCodeMap[selectedStamp.claimCode]}
                        alt={`QR ${selectedStamp.claimCode}`}
                        className="user-stamp-qr"
                      />
                      <p className="user-stamp-claim-code">
                        CAD <strong>{selectedStamp.claimCode}</strong>
                      </p>
                    </>
                  ) : (
                    <div className="user-stamp-modal-image user-stamp-empty" />
                  )}
                </button>
              </div>

              <p className="user-stamp-modal-copy">
                Conseguida el {formatAwardedAt(selectedStamp.awardedAt)}, en la coleccion{" "}
                <strong>{selectedStamp.collectionName}</strong>, en el evento{" "}
                <strong>{selectedStamp.eventName}</strong>.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}





