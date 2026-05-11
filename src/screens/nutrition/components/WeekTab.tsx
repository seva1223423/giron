import React from 'react';
import { WeekStats } from './WeekStats';

/**
 * Wrapper for the "Неделя" tab content. Currently delegates to WeekStats;
 * exists as its own component so future weekly-only widgets (water trend,
 * streaks, etc.) can be added without further restructuring NutritionScreen.
 */
export const WeekTab: React.FC = () => <WeekStats />;
