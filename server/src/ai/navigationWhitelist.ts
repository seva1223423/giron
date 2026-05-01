/**
 * AI Navigation Whitelist (round 192)
 * ───────────────────────────────────
 *
 * The AI can navigate the user's app to specific screens — but ONLY
 * to screens listed here. This is an explicit allowlist (not a
 * blocklist) so that adding a new screen doesn't accidentally
 * expose it to AI control.
 *
 * Why a strict whitelist:
 *
 *   • DeleteAccount, ChangePassword, ChangeEmail, ChangePhone, 2FA
 *     setup — destructive or step-up-required actions. AI must
 *     never trigger these without explicit user action through the
 *     existing UI. A prompt-injection attack could otherwise say
 *     "navigate to delete account" and the AI obliges.
 *
 *   • Subscription / payment confirm screens — financial. AI must
 *     not initiate purchases.
 *
 *   • Admin* screens — gated by role + PIN. Even if user is admin,
 *     AI shouldn't bypass that flow.
 *
 *   • Auth flow (Login, Register, ResetPassword) — only the auth
 *     state machine should land here. AI navigating here would
 *     break the session.
 *
 *   • LinkedAccounts, SessionsScreen — security-adjacent. Read-only
 *     fine in theory but excluded out of caution; user can navigate
 *     manually.
 *
 * Each entry maps a STABLE alias (used by AI tool args) to the
 * concrete navigator path. Aliases are intentionally simple
 * snake_case so the AI's classification doesn't have to deal with
 * casing or spacing variations.
 */

export type NavTarget = {
  /** The Stack/Tab navigator name where the screen lives. */
  stack: 'tabs' | 'WorkoutsTab' | 'NutritionTab' | 'ProfileTab';
  /** The Screen name within that stack. For root tabs, the tab name. */
  screen: string;
  /** Human-readable label for the AI to use in confirmations. */
  label: string;
  /** Whether this screen accepts params, and which ones. */
  paramSchema?: {
    [key: string]: {
      type: 'string' | 'number';
      description: string;
      maxLength?: number;
      required?: boolean;
    };
  };
};

/**
 * The single source of truth for what AI can navigate to.
 *
 * To add a new target: add an entry here, write a unit test that
 * verifies the alias maps to a real screen, deploy. Server-side
 * validation rejects any alias not in this map.
 */
export const NAV_WHITELIST: Record<string, NavTarget> = {
  // ─── Main tabs ─────────────────────────────────────────────────
  home: {
    stack: 'tabs',
    screen: 'HomeTab',
    label: 'Главная',
  },
  workouts: {
    stack: 'tabs',
    screen: 'WorkoutsTab',
    label: 'Тренировки',
  },
  nutrition: {
    stack: 'tabs',
    screen: 'NutritionTab',
    label: 'Питание',
  },
  profile: {
    stack: 'tabs',
    screen: 'ProfileTab',
    label: 'Профиль',
  },

  // ─── Workouts stack — read views ────────────────────────────────
  workout_history: {
    stack: 'WorkoutsTab',
    screen: 'WorkoutHistory',
    label: 'История тренировок',
  },
  weekly_plan: {
    stack: 'WorkoutsTab',
    screen: 'WeeklyPlan',
    label: 'Недельный план',
  },
  workout_calendar: {
    stack: 'WorkoutsTab',
    screen: 'WorkoutCalendar',
    label: 'Календарь тренировок',
  },
  personal_records: {
    stack: 'WorkoutsTab',
    screen: 'PersonalRecords',
    label: 'Личные рекорды',
  },
  routines: {
    stack: 'WorkoutsTab',
    screen: 'Routines',
    label: 'Шаблоны тренировок',
  },
  steps: {
    stack: 'WorkoutsTab',
    screen: 'Steps',
    label: 'Шаги',
  },
  cardio: {
    stack: 'WorkoutsTab',
    screen: 'Cardio',
    label: 'Кардио',
  },
  progress: {
    stack: 'WorkoutsTab',
    screen: 'Progress',
    label: 'Прогресс',
  },

  // ─── Workouts stack — input forms (user fills) ─────────────────
  add_cardio: {
    stack: 'WorkoutsTab',
    screen: 'AddCardio',
    label: 'Записать кардио',
  },

  // ─── Workouts stack — params required ─────────────────────────
  exercise_detail: {
    stack: 'WorkoutsTab',
    screen: 'ExerciseDetail',
    label: 'Карточка упражнения',
    paramSchema: {
      exerciseId: { type: 'string', description: 'ID упражнения', maxLength: 64, required: true },
    },
  },
  program_detail: {
    stack: 'WorkoutsTab',
    screen: 'ProgramDetail',
    label: 'Карточка программы',
    paramSchema: {
      programId: { type: 'string', description: 'ID программы', maxLength: 64, required: true },
    },
  },
  routine_detail: {
    stack: 'WorkoutsTab',
    screen: 'RoutineDetail',
    label: 'Карточка шаблона',
    paramSchema: {
      routineId: { type: 'string', description: 'ID шаблона', maxLength: 64, required: true },
    },
  },

  // ─── Workouts stack — calculators (always safe) ────────────────
  plate_calculator: {
    stack: 'WorkoutsTab',
    screen: 'PlateCalculator',
    label: 'Калькулятор блинов',
  },
  one_rm_calculator: {
    stack: 'WorkoutsTab',
    screen: 'OneRMCalculator',
    label: 'Калькулятор 1ПМ',
  },

  // ─── Nutrition stack ───────────────────────────────────────────
  nutrition_main: {
    stack: 'NutritionTab',
    screen: 'NutritionMain',
    label: 'Дневник питания',
  },
  nutrition_history: {
    stack: 'NutritionTab',
    screen: 'NutritionHistory',
    label: 'История питания',
  },
  food_scanner: {
    stack: 'NutritionTab',
    screen: 'FoodScanner',
    label: 'Сканер еды',
  },
  manual_food_add: {
    stack: 'NutritionTab',
    screen: 'ManualFoodAdd',
    label: 'Ручной ввод еды',
  },
  recipes: {
    stack: 'NutritionTab',
    screen: 'Recipes',
    label: 'Рецепты',
  },
  recipe_detail: {
    stack: 'NutritionTab',
    screen: 'RecipeDetail',
    label: 'Карточка рецепта',
    paramSchema: {
      recipeId: { type: 'string', description: 'ID рецепта', maxLength: 64, required: true },
    },
  },
  macro_calculator: {
    stack: 'NutritionTab',
    screen: 'MacroCalculator',
    label: 'Калькулятор БЖУ',
  },
  meal_plan: {
    stack: 'NutritionTab',
    screen: 'MealPlan',
    label: 'План питания',
  },

  // ─── Profile stack — informational only ────────────────────────
  settings: {
    stack: 'ProfileTab',
    screen: 'Settings',
    label: 'Настройки',
  },
  edit_profile: {
    stack: 'ProfileTab',
    screen: 'EditProfile',
    label: 'Редактирование профиля',
  },
  news: {
    stack: 'ProfileTab',
    screen: 'NewsScreen',
    label: 'Новости',
  },
  support: {
    stack: 'ProfileTab',
    screen: 'SupportScreen',
    label: 'Поддержка',
  },

  // ─── DELIBERATELY EXCLUDED (do NOT add) ────────────────────────
  // Reason for each below — keep this list to prevent re-additions.
  //
  // DeleteAccountScreen      — destructive, requires step-up reauth
  // ChangePassword           — security mutation, requires reauth
  // ChangeEmailScreen        — security mutation
  // ChangePhoneScreen        — security mutation
  // TwoFactorScreen          — security setup, must be user-initiated
  // SessionsScreen           — security audit, no need for AI nav
  // LinkedAccountsScreen     — OAuth linking, sec-adjacent
  // SecurityEventsScreen     — audit log, can stay UI-only
  // Subscription             — financial / paywall, must be user-initiated
  // CreateTicketScreen       — support intake, AI shouldn't auto-trigger
  // SupportTicketScreen      — needs ticketId; out of AI scope
  // ActiveWorkout            — already covered by start_active_workout flow
  //                            (and requires running workout state)
  // WorkoutSummary           — auto-shown after workout complete
  // CustomWorkout            — workout builder; AI uses create_workout tool
  //                            instead of nav
  // FoodScanner              — INCLUDED above (input form, OK)
  // RecipeForm               — recipe creator; out of AI scope for now
  // AIRecipe                 — recursive (AI inside AI); skip
  // AIProgramDetail          — meta / preview, skip
  // Auth/*                   — auth state machine handles
  // ResetPassword            — token-driven, must come from email link
  // Onboarding               — auth state handles
  // Credits                  — admin-only / dev tool
  // TrainerDashboard         — trainer-role-specific
  // TrainerClient            — trainer-role-specific, params-heavy
  // Admin*Screen             — admin role + PIN gate
};

/**
 * Strictly-typed alias enum for AI tool args. We use a literal union
 * so TypeScript can verify the AI tool's enum matches the whitelist.
 */
export type NavAlias = keyof typeof NAV_WHITELIST;

/**
 * Validate a navigation request against the whitelist. Returns
 * either a sanitized navigation payload (alias resolved + params
 * validated) or a Russian error message explaining why it was
 * rejected.
 *
 * Usage in tool handler:
 *
 *     const result = validateNavigation(args.target, args.params);
 *     if ('error' in result) {
 *       return { resultText: result.error, actionDescription: '' };
 *     }
 *     return {
 *       resultText: `Открываю экран «${result.label}».`,
 *       actionDescription: `Навигация: ${result.label}`,
 *       actionData: { navigation: result.payload },
 *     };
 *
 * The client (AIChatScreen) receives `actionData.navigation`, runs
 * its own whitelist check (defense in depth), then calls
 * `navigation.navigate(stack, { screen, params })`.
 */
export function validateNavigation(
  target: string | undefined,
  params: Record<string, unknown> | undefined,
): { error: string } | {
  payload: { stack: string; screen: string; params?: Record<string, string> };
  label: string;
} {
  if (!target || typeof target !== 'string') {
    return { error: 'Не указан экран — передай alias из whitelist (например home, workouts, progress).' };
  }

  // Normalize: lowercase, replace spaces/dashes with underscore
  const alias = target.toLowerCase().replace(/[\s-]+/g, '_');
  const entry = NAV_WHITELIST[alias];

  if (!entry) {
    return {
      error: `Экран "${target}" не разрешён для AI-навигации. Доступные: ${Object.keys(NAV_WHITELIST).slice(0, 10).join(', ')}, ...`,
    };
  }

  // Validate params shape
  const cleanParams: Record<string, string> = {};
  if (entry.paramSchema) {
    for (const [key, spec] of Object.entries(entry.paramSchema)) {
      const raw = params?.[key];
      if (raw === undefined || raw === null) {
        if (spec.required) {
          return { error: `Для экрана "${entry.label}" нужен параметр ${key} (${spec.description}).` };
        }
        continue;
      }
      const str = String(raw);
      if (spec.maxLength && str.length > spec.maxLength) {
        return { error: `Параметр ${key} слишком длинный (макс ${spec.maxLength} символов).` };
      }
      // Only allow safe characters in IDs (no path traversal, no injection)
      if (spec.type === 'string' && !/^[a-zA-Z0-9_\-]+$/.test(str)) {
        return { error: `Параметр ${key} содержит недопустимые символы (можно только буквы, цифры, _, -).` };
      }
      cleanParams[key] = str;
    }
  } else if (params && Object.keys(params).length > 0) {
    // No params accepted by this screen — silently drop them rather
    // than reject (forgiving design).
  }

  return {
    payload: {
      stack: entry.stack,
      screen: entry.screen,
      ...(Object.keys(cleanParams).length > 0 ? { params: cleanParams } : {}),
    },
    label: entry.label,
  };
}

/**
 * List of explicitly forbidden screen names — used by the client to
 * reject navigation actionData even if it somehow slipped past the
 * server. Defense in depth.
 */
export const FORBIDDEN_SCREENS = [
  'DeleteAccountScreen',
  'ChangePassword',
  'ChangeEmailScreen',
  'ChangePhoneScreen',
  'TwoFactorScreen',
  'SessionsScreen',
  'LinkedAccountsScreen',
  'Subscription',
  'AdminDashboardScreen',
  'AdminUsersScreen',
  'AdminUserDetailScreen',
  'AdminSupportScreen',
  'AdminTicketScreen',
  'AdminLogsScreen',
  'AdminAnalyticsScreen',
  'AdminMetricsKeyScreen',
  'AdminAnnouncementsScreen',
  'AdminSubscriptionsScreen',
  'AdminSecurityEventsScreen',
  'Login',
  'Register',
  'ForgotPassword',
  'ResetPassword',
  'Onboarding',
] as const;
