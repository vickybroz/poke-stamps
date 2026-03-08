export type UserStatus = "active" | "pending" | "provisional" | "inactive";

export type EventItem = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  image_url: string | null;
};

export type CollectionItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};

export type StampItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};

export type EventCollectionLink = {
  event_id: string;
  collection_id: string;
};

export type AdminEventOverviewRow = {
  event_id: string;
  event_name: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_description: string | null;
  event_image_url: string | null;
  collection_id: string | null;
  collection_name: string | null;
};

export type CollectionStampLink = {
  collection_id: string;
  stamp_id: string;
};

export type AdminAlbumRow = {
  event_id: string;
  event_name: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_description: string | null;
  event_image_url: string | null;
  collection_id: string;
  collection_name: string;
  collection_description: string | null;
  collection_image_url: string | null;
  stamp_id: string | null;
  stamp_name: string | null;
  stamp_description: string | null;
  stamp_image_url: string | null;
};

export type AdminCollectionOverviewRow = {
  collection_id: string;
  collection_name: string;
  collection_description: string | null;
  collection_image_url: string | null;
  event_id: string | null;
  event_name: string | null;
  stamp_id: string | null;
  stamp_name: string | null;
  stamp_description: string | null;
  stamp_image_url: string | null;
};

export type AdminStampOverviewRow = {
  stamp_id: string;
  stamp_name: string;
  stamp_description: string | null;
  stamp_image_url: string | null;
  collection_id: string | null;
  collection_name: string | null;
};

export type StampClaimLookupResult = {
  id: string;
  claim_code: string;
  awarded_at: string;
  event_id: string;
  event_name: string;
  collection_id: string;
  collection_name: string;
  stamp_id: string;
  stamp_name: string;
  stamp_image_url: string | null;
  delivered_to_id: string;
  delivered_to_name: string | null;
  delivered_to_code: string;
  delivered_to_status: UserStatus;
  delivered_by_id: string | null;
  delivered_by_name: string | null;
  delivered_by_code: string | null;
  delivered_by_role: string | null;
};

export type UserItem = {
  id: string;
  auth_user_id: string | null;
  trainer_name: string | null;
  trainer_code: string;
  email: string | null;
  role: string;
  status: UserStatus;
};

export type LogItem = {
  id: string;
  awarded_at: string;
  claim_code: string;
  event_name: string;
  collection_name: string;
  stamp_name: string;
  trainer_code: string;
  delivered_to: string;
  delivered_by: string;
};

export type LogFilters = {
  awarded_at: string;
  stamp_name: string;
  collection_name: string;
  event_name: string;
  trainer_code: string;
  delivered_to: string;
  delivered_by: string;
  claim_code: string;
};

export type ImageOption = {
  path: string;
  url: string;
  label: string;
  folder: "events" | "collections" | "stamps" | "gallery";
};

export type TrainerLookupState = {
  loading: boolean;
  name: string | null;
  userId: string | null;
  status: UserStatus | null;
  statusLabel: string | null;
  requiresProvisionalConfirmation: boolean;
  info: string | null;
  error: string | null;
};
