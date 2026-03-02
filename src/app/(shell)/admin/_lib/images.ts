import { supabase } from "@/lib/supabase/client";
import { IMAGE_BUCKET } from "./constants";
import type { ImageOption } from "./types";

export async function loadImageLibrary(): Promise<{
  images: ImageOption[];
  error: string | null;
}> {
  const folders: ImageOption["folder"][] = ["events", "collections", "stamps", "gallery"];

  const batches = await Promise.all(
    folders.map(async (folder) => {
      const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list(folder, {
        limit: 200,
        sortBy: { column: "name", order: "asc" },
      });

      if (error || !data) {
        return { error: "No se pudieron cargar algunas imagenes del bucket.", items: [] };
      }

      const items = data
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

      return { error: null, items };
    }),
  );

  const firstError = batches.find((batch) => batch.error)?.error ?? null;

  return {
    images: batches.flatMap((batch) => batch.items),
    error: firstError,
  };
}
