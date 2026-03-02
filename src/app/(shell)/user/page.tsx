"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useNavigationPending } from "@/components/navigation-pending";
import { supabase } from "@/lib/supabase/client";
import { clearAuthAndRedirect, readAuthSnapshot } from "@/lib/auth-snapshot";

type UserState = {
  trainerName: string | null;
  error: string | null;
  loading: boolean;
};

type AlbumEntryRow = {
  event_id: string;
  event_name: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_image_url: string | null;
  event_description: string | null;
  collection_id: string;
  collection_name: string;
  collection_image_url: string | null;
  stamp_id: string;
  stamp_name: string;
  stamp_image_url: string | null;
  owned: boolean;
  awarded_at: string | null;
  claim_code: string | null;
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
  const { stopNavigation } = useNavigationPending();
  const [state, setState] = useState<UserState>({
    trainerName: null,
    error: null,
    loading: true,
  });
  const [albumEntries, setAlbumEntries] = useState<AlbumEntryRow[]>([]);
  const [selectedStamp, setSelectedStamp] = useState<SelectedUserStamp | null>(null);
  const [collapsedEvents, setCollapsedEvents] = useState<string[]>([]);
  const [collapsedCollections, setCollapsedCollections] = useState<string[]>([]);
  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [isModalVerifiedOpen, setIsModalVerifiedOpen] = useState(false);

  useEffect(() => {
    const loadUserProfile = async () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot || !snapshot.active) {
        router.replace("/");
        return;
      }

      const { data: albumData, error: albumError } = await supabase.rpc(
        "get_my_album_entries",
      );

      if (albumError) {
        await clearAuthAndRedirect(router);
        return;
      }

      setState({
        trainerName: snapshot.trainerName,
        error: null,
        loading: false,
      });
      setAlbumEntries((albumData as AlbumEntryRow[] | null) ?? []);
      stopNavigation();
    };

    void loadUserProfile();
  }, [router, stopNavigation]);

  useEffect(() => {
    const claimCodes = Array.from(
      new Set(
        albumEntries
          .map((row) => row.claim_code)
          .filter((claimCode): claimCode is string => Boolean(claimCode)),
      ),
    );

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
  }, [albumEntries]);

  const eventGroups = useMemo(() => {
    const eventsMap = new Map<
      string,
      {
        id: string;
        name: string;
        starts_at: string;
        ends_at: string | null;
        image_url: string | null;
        description: string | null;
        collections: Map<
          string,
          {
            id: string;
            name: string;
            image_url: string | null;
            stamps: Array<{
              id: string;
              name: string;
              image_url: string | null;
              owned: boolean;
              claimCode: string | null;
              awardedAt: string | null;
            }>;
          }
        >;
      }
    >();

    albumEntries.forEach((entry) => {
      if (!eventsMap.has(entry.event_id)) {
        eventsMap.set(entry.event_id, {
          id: entry.event_id,
          name: entry.event_name,
          starts_at: entry.event_starts_at,
          ends_at: entry.event_ends_at,
          image_url: entry.event_image_url,
          description: entry.event_description,
          collections: new Map(),
        });
      }

      const eventItem = eventsMap.get(entry.event_id)!;

      if (!eventItem.collections.has(entry.collection_id)) {
        eventItem.collections.set(entry.collection_id, {
          id: entry.collection_id,
          name: entry.collection_name,
          image_url: entry.collection_image_url,
          stamps: [],
        });
      }

      const collectionItem = eventItem.collections.get(entry.collection_id)!;
      collectionItem.stamps.push({
        id: entry.stamp_id,
        name: entry.stamp_name,
        image_url: entry.stamp_image_url,
        owned: entry.owned,
        claimCode: entry.claim_code,
        awardedAt: entry.awarded_at,
      });
    });

    return Array.from(eventsMap.values()).map((eventItem) => ({
      ...eventItem,
      collections: Array.from(eventItem.collections.values()),
    }));
  }, [albumEntries]);

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
        <section className="user-shell">       <h1 className="page-title">Mi album</h1>
          <p className="admin-muted">Cargando...</p>
        </section>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="user-screen">
        <section className="user-shell"><h1 className="page-title">Mi album</h1>
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
      <section className="user-shell">       <h1 className="page-title">Mi album</h1>
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
      </section>

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
    </main>
  );
}
