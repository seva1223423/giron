import React, { useState, useMemo } from 'react';
import { Exercise } from '../../types';
import { ExerciseSelectStep, ConfigureStepContainer } from './components';

export const CustomWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>([]);

  const toggleExercise = (exercise: Exercise) => {
    setSelectedExercises((prev) => {
      const exists = prev.find((e) => e.id === exercise.id);
      if (exists) return prev.filter((e) => e.id !== exercise.id);
      return [...prev, exercise];
    });
  };

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    setSelectedExercises((prev) => {
      const arr = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= arr.length) return prev;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  const selectedIds = useMemo(() => new Set(selectedExercises.map((e) => e.id)), [selectedExercises]);

  if (step === 'configure') {
    return (
      <ConfigureStepContainer
        selectedExercises={selectedExercises}
        onRemove={toggleExercise}
        onMove={moveExercise}
        onBack={() => setStep('select')}
        navigation={navigation}
      />
    );
  }

  return (
    <ExerciseSelectStep
      selectedIds={selectedIds}
      onToggle={toggleExercise}
      onNext={() => setStep('configure')}
      onCancel={() => navigation.goBack()}
    />
  );
};
