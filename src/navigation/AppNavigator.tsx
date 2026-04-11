import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore, useAuthStore } from '../store';
import { useConnectionStore } from '../store/useConnectionStore';
import { typography } from '../theme';
import { requestNotificationPermissions } from '../services/notificationService';
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
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { NewsScreen } from '../screens/news/NewsScreen';
import { AIChatScreen } from '../screens/ai/AIChatScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { SubscriptionScreen } from '../screens/profile/SubscriptionScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
import { TrainerClientScreen } from '../screens/trainer/TrainerClientScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { CardioScreen } from '../screens/cardio/CardioScreen';
import { AddCardioScreen } from '../screens/cardio/AddCardioScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const WorkoutsStack = createNativeStackNavigator();
const NutritionStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

// Tab icon component
const TabIcon: React.FC<{ label: string; emoji: string; focused: boolean }> = ({ label, emoji, focused }) => {
  const { colors } = useThemeStore();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4 }}>
      <Text style={{ fontSize: 24 }}>{emoji}</Text>
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
    </NutritionStack.Navigator>
  );
}

// Profile Stack
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Subscription" component={SubscriptionScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="TrainerDashboard" component={TrainerDashboardScreen} />
      <ProfileStack.Screen name="TrainerClient" component={TrainerClientScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Главная" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="WorkoutsTab"
        component={WorkoutsStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="💪" label="Тренировки" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="NutritionTab"
        component={NutritionStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🍽" label="Питание" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProgressTab"
        component={ProgressScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" label="Прогресс" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="AITab"
        component={AIChatScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🤖" label="ИИ" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="NewsTab"
        component={NewsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📰" label="Новости" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Профиль" focused={focused} />,
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

const linking = {
  prefixes: ['irongym://', 'https://irongym.app'],
  config: {
    screens: {
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

  // Request notification permissions once on first authenticated launch
  useEffect(() => {
    if (isAuthenticated && isOnboarded) {
      requestNotificationPermissions();
    }
  }, [isAuthenticated, isOnboarded]);

  // Apply auto theme when app comes to foreground
  useEffect(() => {
    applyAutoTheme();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyAutoTheme();
    });
    return () => sub.remove();
  }, [applyAutoTheme]);

  return (
    <NavigationContainer linking={linking}>
      <View style={{ flex: 1 }}>
        {!isOnline && (
          <View style={{ backgroundColor: colors.warning, paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>⚠️ Нет соединения — данные сохраняются локально</Text>
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
    </NavigationContainer>
  );
};
