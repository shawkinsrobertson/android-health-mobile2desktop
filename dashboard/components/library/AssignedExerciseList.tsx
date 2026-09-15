import { groupIntoUnits } from "@/lib/workout-blocks";
import { VideoPreview } from "./VideoPreview";

export interface AssignedExerciseItem {
  id: string;
  block_id: string | null;
  order_index: number;
  name: string;
  instructions: string | null;
  photo_path: string | null;
  photo_url: string | null;
  video_path: string | null;
  video_url: string | null;
  sets: number | null;
  reps: string | null;
  prescription_type: "reps" | "time";
  duration_seconds: number | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface AssignedBlock {
  id: string;
  block_type: "superset" | "circuit";
  rounds: number;
  notes: string | null;
}

function summarize(item: AssignedExerciseItem): string {
  return (
    [
      item.sets ? `${item.sets} sets` : null,
      item.prescription_type === "time"
        ? item.duration_seconds
          ? `${item.duration_seconds}s`
          : null
        : item.reps
          ? `${item.reps} reps`
          : null,
      item.weight_note,
      item.rest_seconds ? `${item.rest_seconds}s rest` : null,
      item.tempo,
    ]
      .filter(Boolean)
      .join(" · ") || "No prescription details"
  );
}

function ExerciseDetail({
  item,
  photoUrl,
  videoUrl,
}: {
  item: AssignedExerciseItem;
  photoUrl: string | null;
  videoUrl: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-primary">{item.name}</div>
        <div className="text-xs text-ink-muted">{summarize(item)}</div>
        {item.instructions && <p className="mt-1 text-xs text-ink-secondary">{item.instructions}</p>}
        {item.notes && <p className="mt-1 text-xs text-ink-secondary">{item.notes}</p>}
        <VideoPreview
          path={item.video_path}
          url={item.video_url}
          resolvedUrl={videoUrl}
          className="mt-2 max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]"
        />
      </div>
    </div>
  );
}

// Renders an assigned workout's exercises, grouping consecutive
// superset/circuit members into a labeled block just like the coach's
// editor -- media must already be resolved (signed/external URLs), keyed
// by exercise id, since this is a plain server component with no access
// to the Supabase client itself.
export function AssignedExerciseList({
  exercises,
  blocks,
  media,
}: {
  exercises: AssignedExerciseItem[];
  blocks: AssignedBlock[];
  media: Record<string, { photoUrl: string | null; videoUrl: string | null }>;
}) {
  const units = groupIntoUnits(exercises, blocks);

  if (units.length === 0) {
    return <p className="text-sm text-ink-muted">No exercises in this workout.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {units.map((unit) =>
        unit.type === "exercise" ? (
          <li key={unit.key} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
            <ExerciseDetail
              item={unit.item}
              photoUrl={media[unit.item.id]?.photoUrl ?? null}
              videoUrl={media[unit.item.id]?.videoUrl ?? null}
            />
          </li>
        ) : (
          <li key={unit.key} className="rounded-lg border-2 border-[color:var(--series-exercise)]/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
                {unit.block.block_type}
              </span>
              <span className="text-xs text-ink-muted">{unit.block.rounds} rounds</span>
            </div>
            <ul className="flex flex-col gap-2">
              {unit.members.map((member) => (
                <li key={member.id} className="rounded-md border border-[color:var(--border-hairline)] bg-surface p-2">
                  <ExerciseDetail
                    item={member}
                    photoUrl={media[member.id]?.photoUrl ?? null}
                    videoUrl={media[member.id]?.videoUrl ?? null}
                  />
                </li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}
