import { http, HttpResponse } from "msw";

// Covers only the endpoints exercised by stories -- see
// components/library/DraftWorkoutPrompt.stories.tsx.
export const mswHandlers = [
  http.post("/api/library/workouts/draft", () => HttpResponse.json({ workoutId: "story-workout-1" })),
];
