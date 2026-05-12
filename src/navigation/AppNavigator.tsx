import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createMaterialTopTabNavigator, type MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Text, View, AppState, Platform, Linking, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore, useThemeColors, useAuthStore } from '../store';
import { useConnectionStore } from '../store/useConnectionStore';
import { typography } from '../theme';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions, registerPushTokenWithServer } from '../services/notificationService';
import { ErrorBoundary, Icon } from '../components';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { WorkoutsScreen } from '../screens/workouts/WorkoutsScreen';
import { ActiveWorkoutScreen } from '../screens/tracker/ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../screens/workouts/ExerciseDetailScreen';
import { WorkoutSummaryScreen } from '../screens/workouts/WorkoutSummaryScreen';
import { CustomWorkoutScreen } from '../screens/workouts/CustomWorkoutScreen';
import { PlateCalculatorScreen } from '../screens/workouts/PlateCalculatorScreen';
import { ProgramDetailScreen } from '../screens/workouts/ProgramDetailScreen';
import { WorkoutHistoryScreen } from '../screens/workouts/WorkoutHistoryScreen';
import { WeeklyPlanScreen } from '../screens/workouts/WeeklyPlanScreen';
import { RoutinesListScreen } from '../screens/workouts/RoutinesListScreen';
import { RoutineDetailScreen } from '../screens/workouts/RoutineDetailScreen';
import { OneRMCalculatorScreen } from '../screens/workouts/OneRMCalculatorScreen';
import { WorkoutCalendarScreen } from '../screens/workouts/WorkoutCalendarScreen';
import { PersonalRecordsScreen } from '../screens/workouts/PersonalRecordsScreen';
import { StepsScreen } from '../screens/workouts/StepsScreen';
import { NutritionScreen } from '../screens/nutrition/NutritionScreen';
import { FoodScannerScreen } from '../screens/nutrition/FoodScannerScreen';
import { ManualFoodAddScreen } from '../screens/nutrition/ManualFoodAddScreen';
import { NutritionHistoryScreen } from '../screens/nutrition/NutritionHistoryScreen';
import { MacroCalculatorScreen } from '../screens/nutrition/MacroCalculatorScreen';
import { MealPlanScreen } from '../screens/nutrition/MealPlanScreen';
import {
  RecipesScreen,
  RecipeDetailScreen,
  RecipeFormScreen,
  AIRecipeScreen,
} from '../screens/nutrition/recipes';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { NewsScreen } from '../screens/news/NewsScreen';
import { AIChatScreen } from '../screens/ai/AIChatScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { SubscriptionScreen } from '../screens/profile/SubscriptionScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
import { TrainerClientScreen } from '../screens/trainer/TrainerClientScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { CreditsScreen } from '../screens/settings/CreditsScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { SessionsScreen } from '../screens/profile/SessionsScreen';
import { DeleteAccountScreen } from '../screens/profile/DeleteAccountScreen';
import { SecurityEventsScreen } from '../screens/profile/SecurityEventsScreen';
import { ChangePhoneScreen } from '../screens/profile/ChangePhoneScreen';
import { TwoFactorScreen } from '../screens/profile/TwoFactorScreen';
import { ChangeEmailScreen } from '../screens/profile/ChangeEmailScreen';
import { LinkedAccountsScreen } from '../screens/profile/LinkedAccountsScreen';
import { CardioScreen } from '../screens/cardio/CardioScreen';
import { AddCardioScreen } from '../screens/cardio/AddCardioScreen';
import HealthScreen from '../screens/health/HealthScreen';
import SupportScreen from '../screens/support/SupportScreen';
import CreateTicketScreen from '../screens/support/CreateTicketScreen';
import SupportTicketScreen from '../screens/support/SupportTicketScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminUserDetailScreen from '../screens/admin/AdminUserDetailScreen';
import AdminSupportScreen from '../screens/admin/AdminSupportScreen';
import AdminTicketScreen from '../screens/admin/AdminTicketScreen';
import AdminLogsScreen from '../screens/admin/AdminLogsScreen';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminMetricsKeyScreen from '../screens/admin/AdminMetricsKeyScreen';
import AdminAnnouncementsScreen from '../screens/admin/AdminAnnouncementsScreen';
import AdminSubscriptionsScreen from '../screens/admin/AdminSubscriptionsScreen';
import AdminSecurityEventsScreen from '../screens/admin/AdminSecurityEventsScreen';
import { AdminGuard } from '../screens/admin/AdminGuard';
import { AIProgramDetailScreen } from '../screens/workouts/AIProgramDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createMaterialTopTabNavigator();
const WorkoutsStack = createNativeStackNavigator();
const NutritionStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

// Round 233 (2026-05-02 audit): TAB_ICONS map was DEAD CODE — never read,
// PremiumTabBar uses TAB_META below. Each entry was a banned unicode glyph
// shipping in the binary. Removed entirely.

/**
 * Premium tab-bar tile per Direction A design (TabBar in primitives.jsx).
 *
 *  - SVG icon from the shared Icon set (no more unicode glyphs)
 *  - Active: gold icon + gold label (no bg tile — the floating bar
 *    itself provides the containment)
 *  - Inactive: textSub grey, same size
 *  - Center "ai" variant: gold-filled 56pt rounded-square pill raised
 *    a few pixels above the other tabs, so the AI tab reads as the
 *    app's signature action no matter what else changes
 *
 * The TabBar background (translucent, rounded, floating) is set on
 * screenOptions.tabBarStyle — this component only handles the tile
 * itself.
 */
import type { IconName as IconSetName } from '../components';
const TabIcon: React.FC<{ label: string; iconName: IconSetName; focused: boolean; center?: boolean }> = ({ label, iconName, focused, center }) => {
  const { colors } = useThemeStore();

  if (center) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: -8 }}>
        <View style={{
          width: 56,
          height: 56,
          borderRadius: 20,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.33,
          shadowRadius: 20,
          elevation: 8,
        }}>
          <Icon name={iconName} size={26} color={colors.textInverse} strokeWidth={2} />
        </View>
      </View>
    );
  }

  const color = focused ? colors.tabBarActive : colors.tabBarInactive;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 3 }}>
      <Icon name={iconName} size={22} color={color} />
      <Text style={[typography.tabLabel, { fontSize: 10, color, fontWeight: '600', letterSpacing: 0.2 }]}>
        {label}
      </Text>
    </View>
  );
};

// Round 266: per-screen ErrorBoundary wrappers for the two highest-risk
// screens. Without these, a render-phase crash in AI chat or active
// workout would tear down the entire tab navigator (back-stack lost,
// user dropped to root). Wrapping the screen component (vs. the
// navigator) means a crash leaves the rest of the app fully usable.
const ActiveWorkoutScreenSafe: React.FC<any> = (props) => (
  <ErrorBoundary scope="active-workout"><ActiveWorkoutScreen {...props} /></ErrorBoundary>
);
const AIChatScreenSafe: React.FC<any> = (props) => (
  <ErrorBoundary scope="ai-chat"><AIChatScreen {...props} /></ErrorBoundary>
);

// Workouts Stack
function WorkoutsStackNavigator() {
  return (
    <WorkoutsStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <WorkoutsStack.Screen name="WorkoutsList" component={WorkoutsScreen} />
      <WorkoutsStack.Screen name="ActiveWorkout" component={ActiveWorkoutScreenSafe} options={{ animation: 'fade_from_bottom' }} />
      <WorkoutsStack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <WorkoutsStack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="CustomWorkout" component={CustomWorkoutScreen} />
      <WorkoutsStack.Screen name="PlateCalculator" component={PlateCalculatorScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="ProgramDetail" component={ProgramDetailScreen} />
      <WorkoutsStack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <WorkoutsStack.Screen name="WeeklyPlan" component={WeeklyPlanScreen} />
      <WorkoutsStack.Screen name="Routines" component={RoutinesListScreen} />
      <WorkoutsStack.Screen name="RoutineDetail" component={RoutineDetailScreen} />
      <WorkoutsStack.Screen name="OneRMCalculator" component={OneRMCalculatorScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="WorkoutCalendar" component={WorkoutCalendarScreen} />
      <WorkoutsStack.Screen name="PersonalRecords" component={PersonalRecordsScreen} />
      <WorkoutsStack.Screen name="Steps" component={StepsScreen} />
      <WorkoutsStack.Screen name="Cardio" component={CardioScreen} />
      <WorkoutsStack.Screen name="AddCardio" component={AddCardioScreen} options={{ animation: 'slide_from_bottom' }} />
      <WorkoutsStack.Screen name="AIProgramDetail" component={AIProgramDetailScreen} />
      {/* Прогресс перенесён сюда из таб-бара. Доступен по навигации
          (Home → quick action), но не показывается в WorkoutsScreen. */}
      <WorkoutsStack.Screen name="Progress" component={ProgressScreen} options={{ animation: 'slide_from_right' }} />
    </WorkoutsStack.Navigator>
  );
}

// Nutrition Stack
function NutritionStackNavigator() {
  return (
    <NutritionStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <NutritionStack.Screen name="NutritionMain" component={NutritionScreen} />
      <NutritionStack.Screen name="FoodScanner" component={FoodScannerScreen} options={{ animation: 'fade_from_bottom' }} />
      <NutritionStack.Screen name="ManualFoodAdd" component={ManualFoodAddScreen} options={{ animation: 'slide_from_bottom' }} />
      <NutritionStack.Screen name="NutritionHistory" component={NutritionHistoryScreen} />
      <NutritionStack.Screen name="MacroCalculator" component={MacroCalculatorScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <NutritionStack.Screen name="MealPlan" component={MealPlanScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <NutritionStack.Screen name="Recipes" component={RecipesScreen} />
      <NutritionStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <NutritionStack.Screen name="RecipeForm" component={RecipeFormScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <NutritionStack.Screen name="AIRecipe" component={AIRecipeScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
    </NutritionStack.Navigator>
  );
}

// Profile Stack
function ProfileStackNavigator() {
  // Round 233 (2026-05-02 audit): headerStyle/headerTintColor were
  // hardcoded `#0F0F0F` / `#FFFFFF` — broke in light mode (white-on-white).
  // Now resolved through useThemeColors() so the header tracks theme.
  const colors = useThemeColors();
  return (
    <ProfileStack.Navigator
      screenOptions={({ route }) => ({
        headerShown: ['SupportScreen','CreateTicketScreen','SupportTicketScreen','LinkedAccountsScreen',
          'AdminDashboardScreen','AdminUsersScreen','AdminUserDetailScreen',
          'AdminSupportScreen','AdminTicketScreen','AdminLogsScreen','AdminAnalyticsScreen',
          'AdminMetricsKeyScreen',
          'AdminAnnouncementsScreen','AdminSubscriptionsScreen','AdminSecurityEventsScreen'].includes(route.name),
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' as const },
        headerBackTitle: '',
      })}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Health" component={HealthScreen} options={{ title: 'Здоровье и часы' }} />
      <ProfileStack.Screen name="Subscription" component={SubscriptionScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="TrainerDashboard" component={TrainerDashboardScreen} />
      <ProfileStack.Screen name="TrainerClient" component={TrainerClientScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Credits" component={CreditsScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ animation: 'slide_from_right' }} />
      <ProfileStack.Screen name="SessionsScreen" component={SessionsScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="DeleteAccountScreen" component={DeleteAccountScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="SecurityEventsScreen" component={SecurityEventsScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="ChangePhoneScreen" component={ChangePhoneScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="TwoFactorScreen" component={TwoFactorScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="ChangeEmailScreen" component={ChangeEmailScreen} options={{ headerShown: false }} />
      {/* Привязанные аккаунты — отдельный экран; раньше жил inline в ProfileScreen */}
      <ProfileStack.Screen name="LinkedAccountsScreen" component={LinkedAccountsScreen} options={{ title: 'Привязанные аккаунты' }} />
      {/* Support */}
      <ProfileStack.Screen name="NewsScreen" component={NewsScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="SupportScreen" component={SupportScreen} options={{ title: 'Поддержка' }} />
      <ProfileStack.Screen name="CreateTicketScreen" component={CreateTicketScreen} options={{ title: 'Новое обращение' }} />
      <ProfileStack.Screen name="SupportTicketScreen" component={SupportTicketScreen} options={{ title: 'Обращение' }} />
      {/* Admin — all screens wrapped in AdminGuard for role+PIN verification */}
      <ProfileStack.Screen name="AdminDashboardScreen" options={{ title: 'Панель администратора' }}>
        {() => <AdminGuard><AdminDashboardScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminUsersScreen" options={{ title: 'Пользователи' }}>
        {() => <AdminGuard requireVerified><AdminUsersScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminUserDetailScreen" options={{ title: 'Пользователь' }}>
        {() => <AdminGuard requireVerified><AdminUserDetailScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminSupportScreen" options={{ title: 'Тикеты поддержки' }}>
        {() => <AdminGuard requireVerified><AdminSupportScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminTicketScreen" options={{ title: 'Тикет' }}>
        {() => <AdminGuard requireVerified><AdminTicketScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminLogsScreen" options={{ title: 'Лог действий' }}>
        {() => <AdminGuard requireVerified><AdminLogsScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminAnalyticsScreen" options={{ title: 'Аналитика' }}>
        {() => <AdminGuard requireVerified><AdminAnalyticsScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminMetricsKeyScreen" options={{ title: '5 ключевых чисел' }}>
        {() => <AdminGuard requireVerified><AdminMetricsKeyScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminAnnouncementsScreen" options={{ title: 'Объявления' }}>
        {() => <AdminGuard requireVerified><AdminAnnouncementsScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminSubscriptionsScreen" options={{ title: 'Подписки' }}>
        {() => <AdminGuard requireVerified><AdminSubscriptionsScreen /></AdminGuard>}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="AdminSecurityEventsScreen" options={{ title: 'События безопасности' }}>
        {() => <AdminGuard requireVerified><AdminSecurityEventsScreen /></AdminGuard>}
      </ProfileStack.Screen>
    </ProfileStack.Navigator>
  );
}

// Tab metadata: icon name, label, accessibility label, and whether
// it's the gold center variant (AI). Lookup keyed by route name so
// PremiumTabBar can render any subset/order without hard-coding indexes.
type TabMeta = {
  iconName: IconSetName;
  label: string;
  accessibilityLabel: string;
  center?: boolean;
};
const TAB_META: Record<string, TabMeta> = {
  HomeTab: { iconName: 'home', label: 'Главная', accessibilityLabel: 'Главная' },
  WorkoutsTab: { iconName: 'dumbbell', label: 'Тренировки', accessibilityLabel: 'Тренировки' },
  AITab: { iconName: 'spark', label: 'ИИ', accessibilityLabel: 'ИИ-тренер', center: true },
  NutritionTab: { iconName: 'apple', label: 'Питание', accessibilityLabel: 'Питание' },
  ProfileTab: { iconName: 'user', label: 'Профиль', accessibilityLabel: 'Профиль' },
};

/**
 * Custom tab bar for the material-top-tabs navigator. We use the top-tabs
 * navigator with `tabBarPosition="bottom"` so users get native horizontal
 * swipes between tabs (powered by react-native-pager-view) — that's the
 * "качественный приятный свайп" feel the design called for. The visual
 * shell of the bar (translucent background, gold AI center pill, 88pt
 * height with safe-area bottom inset) is preserved 1:1 from the previous
 * bottom-tab-navigator implementation, so the swap is invisible to users
 * except for the new gesture.
 *
 * Hides itself while the keyboard is up — the previous bottom-tab impl
 * relied on `tabBarHideOnKeyboard`, which top-tabs doesn't expose, so we
 * reproduce that behavior with a Keyboard listener.
 */
const PremiumTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation }) => {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);

  React.useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.tabBar,
        borderTopColor: colors.tabBarBorder,
        borderTopWidth: 1,
        height: 88,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 10,
      }}
    >
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;

        const onPress = () => {
          // Mirror React Navigation's tab-bar onPress contract: emit a
          // tabPress event so listeners (e.g. scroll-to-top, refresh) can
          // intercept; only navigate if no listener prevented default and
          // we're not already on this tab.
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={meta.accessibilityLabel}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <TabIcon
              iconName={meta.iconName}
              label={meta.label}
              focused={focused}
              center={meta.center}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

// Main Tab Navigator
function MainTabs() {
  // Read once at first render so the tab navigator initialRouteName is
  // stable for this mount; clearing the flag on mount prevents repeat
  // routing if the user later returns to MainTabs from a deep-linked
  // sub-screen. justOnboarded is transient (not persisted), so app
  // restarts always default back to HomeTab regardless.
  const justOnboarded = useAuthStore((s) => s.justOnboarded);
  const clearJustOnboarded = useAuthStore((s) => s.clearJustOnboarded);
  useEffect(() => {
    if (justOnboarded) {
      // Defer clearing one tick so initialRouteName has consumed the flag
      // before we wipe it. Without this, a fast re-render could see the
      // cleared flag and never apply the AITab landing.
      const t = setTimeout(() => clearJustOnboarded(), 0);
      return () => clearTimeout(t);
    }
  }, [justOnboarded, clearJustOnboarded]);

  return (
    <ErrorBoundary>
    <Tab.Navigator
      initialRouteName={justOnboarded ? 'AITab' : 'HomeTab'}
      tabBarPosition="bottom"
      tabBar={(props) => <PremiumTabBar {...props} />}
      // Material top tabs use react-native-pager-view under the hood,
      // which gives the "premium" horizontal swipe between tabs:
      // rubber-band overscroll on the edges, finger-tracking with
      // velocity-based settle, and inertia. swipeEnabled defaults to
      // true — set explicitly so future readers see the intent.
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        lazy: true,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} />
      <Tab.Screen name="WorkoutsTab" component={WorkoutsStackNavigator} />
      {/* Центральная золотая кнопка-акцент. Visual treatment is applied
          inside PremiumTabBar via TAB_META[AITab].center=true. */}
      <Tab.Screen name="AITab" component={AIChatScreenSafe} />
      <Tab.Screen name="NutritionTab" component={NutritionStackNavigator} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
    </Tab.Navigator>
    </ErrorBoundary>
  );
}

// Auth Stack
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}

const linking: any = {
  // Round 191 (rebrand to Giron): primary new scheme `giron://` plus
  // legacy `giron://` for backward compatibility with notifications
  // already in flight from the previous brand. Both domains supported
  // until the new domain `giron.app` is registered (current hosting
  // remains on `giron.app`).
  prefixes: ['giron://', 'giron://', 'https://giron.app', 'https://giron.app'],
  config: {
    screens: {
      Auth: {
        screens: {
          ResetPassword: 'reset-password',
        },
      },
      Main: {
        screens: {
          HomeTab: 'home',
          WorkoutsTab: {
            screens: {
              WorkoutsList: 'workouts',
              ActiveWorkout: 'workout/active',
              ExerciseDetail: 'exercise/:exerciseId',
            },
          },
          NutritionTab: {
            screens: {
              NutritionMain: 'nutrition',
            },
          },
          AITab: 'ai',
        },
      },
    },
  },
};

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isOnboarded } = useAuthStore();
  const { colors, applyAutoTheme } = useThemeStore();
  const { isOnline } = useConnectionStore();
  const [hydrated, setHydrated] = React.useState(() => useAuthStore.persist.hasHydrated());

  React.useEffect(() => {
    if (!hydrated) {
      return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    }
  }, [hydrated]);

  // Request notification permissions and register push token once on first authenticated launch
  useEffect(() => {
    if (isAuthenticated && isOnboarded) {
      requestNotificationPermissions();
      registerPushTokenWithServer();
    }
  }, [isAuthenticated, isOnboarded]);

  // Handle notification taps — open deep-link URL from notification data.
  // Only allow URLs that match our own app scheme to prevent deep-link injection attacks.
  useEffect(() => {
    // Round 191: post-rebrand allow both new (giron://) and legacy
    // (giron://) schemes. Server-side notifications gradually
    // switch to giron:// but in-flight ones from before the rebuild
    // still use giron://.
    const ALLOWED_PREFIXES = [
      'giron://',
      'https://giron.app/',
      'giron://',
      'https://giron.app/',
    ];
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url && ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
        Linking.openURL(url).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Apply auto theme when app comes to foreground
  useEffect(() => {
    applyAutoTheme();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyAutoTheme();
    });
    return () => sub.remove();
  }, [applyAutoTheme]);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <NavigationContainer linking={linking}>
      <ErrorBoundary>
        <View style={{ flex: 1 }}>
          {!isOnline && (
            <View style={{ backgroundColor: colors.warning, paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text
                style={{ color: colors.textInverse, fontSize: 12, fontWeight: '600' }}
                numberOfLines={2}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >Нет соединения — данные сохраняются локально</Text>
            </View>
          )}
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
            {!isAuthenticated ? (
              <Stack.Screen name="Auth" component={AuthStack} />
            ) : !isOnboarded ? (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            ) : (
              <Stack.Screen name="Main" component={MainTabs} />
            )}
          </Stack.Navigator>
        </View>
      </ErrorBoundary>
    </NavigationContainer>
  );
};
