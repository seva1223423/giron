import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, AppState, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore, useAuthStore } from '../store';
import { useConnectionStore } from '../store/useConnectionStore';
import { typography } from '../theme';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions, registerPushTokenWithServer } from '../services/notificationService';
import { ErrorBoundary } from '../components';

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
import { OneRMCalculatorScreen } from '../screens/workouts/OneRMCalculatorScreen';
import { WorkoutCalendarScreen } from '../screens/workouts/WorkoutCalendarScreen';
import { PersonalRecordsScreen } from '../screens/workouts/PersonalRecordsScreen';
import { NutritionScreen } from '../screens/nutrition/NutritionScreen';
import { FoodScannerScreen } from '../screens/nutrition/FoodScannerScreen';
import { ManualFoodAddScreen } from '../screens/nutrition/ManualFoodAddScreen';
import { NutritionHistoryScreen } from '../screens/nutrition/NutritionHistoryScreen';
import { MacroCalculatorScreen } from '../screens/nutrition/MacroCalculatorScreen';
import { MealPlanScreen } from '../screens/nutrition/MealPlanScreen';
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
import { CardioScreen } from '../screens/cardio/CardioScreen';
import { AddCardioScreen } from '../screens/cardio/AddCardioScreen';
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
import AdminAnnouncementsScreen from '../screens/admin/AdminAnnouncementsScreen';
import AdminSubscriptionsScreen from '../screens/admin/AdminSubscriptionsScreen';
import AdminSecurityEventsScreen from '../screens/admin/AdminSecurityEventsScreen';
import { AdminGuard } from '../screens/admin/AdminGuard';
import { AIProgramDetailScreen } from '../screens/workouts/AIProgramDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const WorkoutsStack = createNativeStackNavigator();
const NutritionStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

// Tab icon shapes
const TAB_ICONS: Record<string, string> = {
  HomeTab: '◉',
  WorkoutsTab: '◎',
  NutritionTab: '◑',
  ProgressTab: '◧',
  AITab: '◈',
  ProfileTab: '○',
};

// Tab icon component
const TabIcon: React.FC<{ label: string; icon: string; focused: boolean }> = ({ label, icon, focused }) => {
  const { colors } = useThemeStore();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4 }}>
      <View style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: focused ? colors.tabBarActive + '15' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: focused ? colors.tabBarActive : colors.tabBarInactive }}>{icon}</Text>
      </View>
      <Text style={[typography.tabLabel, { fontSize: 10, color: focused ? colors.tabBarActive : colors.tabBarInactive, marginTop: 2, marginBottom: 2 }]}>
        {label}
      </Text>
    </View>
  );
};

// Workouts Stack
function WorkoutsStackNavigator() {
  return (
    <WorkoutsStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <WorkoutsStack.Screen name="WorkoutsList" component={WorkoutsScreen} />
      <WorkoutsStack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ animation: 'fade_from_bottom' }} />
      <WorkoutsStack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <WorkoutsStack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="CustomWorkout" component={CustomWorkoutScreen} />
      <WorkoutsStack.Screen name="PlateCalculator" component={PlateCalculatorScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="ProgramDetail" component={ProgramDetailScreen} />
      <WorkoutsStack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <WorkoutsStack.Screen name="WeeklyPlan" component={WeeklyPlanScreen} />
      <WorkoutsStack.Screen name="OneRMCalculator" component={OneRMCalculatorScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <WorkoutsStack.Screen name="WorkoutCalendar" component={WorkoutCalendarScreen} />
      <WorkoutsStack.Screen name="PersonalRecords" component={PersonalRecordsScreen} />
      <WorkoutsStack.Screen name="Cardio" component={CardioScreen} />
      <WorkoutsStack.Screen name="AddCardio" component={AddCardioScreen} options={{ animation: 'slide_from_bottom' }} />
      <WorkoutsStack.Screen name="AIProgramDetail" component={AIProgramDetailScreen} />
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
    </NutritionStack.Navigator>
  );
}

// Profile Stack
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={({ route }) => ({
        headerShown: ['SupportScreen','CreateTicketScreen','SupportTicketScreen',
          'AdminDashboardScreen','AdminUsersScreen','AdminUserDetailScreen',
          'AdminSupportScreen','AdminTicketScreen','AdminLogsScreen','AdminAnalyticsScreen',
          'AdminAnnouncementsScreen','AdminSubscriptionsScreen','AdminSecurityEventsScreen'].includes(route.name),
        animation: 'slide_from_right',
        headerStyle: { backgroundColor: '#0F0F0F' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' as const },
        headerBackTitle: '',
      })}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
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

// Main Tab Navigator
function MainTabs() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();

  return (
    <ErrorBoundary>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 85,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◉" label="Главная" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="WorkoutsTab"
        component={WorkoutsStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◎" label="Тренировки" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="NutritionTab"
        component={NutritionStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◑" label="Питание" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProgressTab"
        component={ProgressScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◧" label="Прогресс" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="AITab"
        component={AIChatScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="◈" label="ИИ" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="○" label="Профиль" focused={focused} />,
        }}
      />
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
  prefixes: ['irongym://', 'https://irongym.app'],
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
          ProgressTab: 'progress',
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
    const ALLOWED_PREFIXES = ['irongym://', 'https://irongym.app/'];
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
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }} numberOfLines={2}>Нет соединения — данные сохраняются локально</Text>
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
