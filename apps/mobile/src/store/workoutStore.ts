import { create } from 'zustand';

export interface ExerciseSet {
  reps: number;
  weight: number;
  completed: boolean;
}

export interface ActiveExercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  restTimeSeconds: number;
}

export interface ActiveSession {
  id: string;
  planId: string;
  exercises: ActiveExercise[];
  startTime: number;
}

interface WorkoutState {
  currentSession: ActiveSession | null;
  currentExerciseIndex: number;
  timer: number; // For rest timer
  isTimerRunning: boolean;
  startWorkout: (session: ActiveSession) => void;
  completeSet: (exerciseIndex: number, setIndex: number, weight: number, reps: number) => void;
  skipExercise: () => void;
  nextExercise: () => void;
  completeWorkout: () => void;
  startTimer: (seconds: number) => void;
  tickTimer: () => void;
  stopTimer: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  currentSession: null,
  currentExerciseIndex: 0,
  timer: 0,
  isTimerRunning: false,
  
  startWorkout: (session) => set({ currentSession: session, currentExerciseIndex: 0, timer: 0, isTimerRunning: false }),
  
  completeSet: (exerciseIndex, setIndex, weight, reps) => {
    set((state) => {
      if (!state.currentSession) return state;
      const newSession = { ...state.currentSession };
      newSession.exercises[exerciseIndex].sets[setIndex] = { reps, weight, completed: true };
      return { currentSession: newSession };
    });
  },
  
  skipExercise: () => {
    set((state) => {
      if (!state.currentSession) return state;
      return { currentExerciseIndex: Math.min(state.currentExerciseIndex + 1, state.currentSession.exercises.length - 1) };
    });
  },

  nextExercise: () => {
    set((state) => {
      if (!state.currentSession) return state;
      return { currentExerciseIndex: Math.min(state.currentExerciseIndex + 1, state.currentSession.exercises.length - 1) };
    });
  },
  
  completeWorkout: () => set({ currentSession: null, currentExerciseIndex: 0, timer: 0, isTimerRunning: false }),
  
  startTimer: (seconds) => set({ timer: seconds, isTimerRunning: true }),
  tickTimer: () => set((state) => ({ timer: Math.max(0, state.timer - 1), isTimerRunning: state.timer > 1 })),
  stopTimer: () => set({ isTimerRunning: false }),
}));
