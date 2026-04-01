import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useThemeStore, useAuthStore } from '../store';
import { typography } from '../theme';
import { requestNotificationPermissions } from '../services/notificationService';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { WorkoutsScreen } from '../screens/workouts/WorkoutsScreen';
import { ActiveWorkoutScreen } from '../screens/tracker/ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../screens/workouts/ExerciseDetailScreen';
import { WorkoutSummaryScreen } from '../screens/workouts/WorkoutSummaryScreen';
import { CustomWorkoutScreen } from '../screens/workouts/CustomWorkoutScreen';
import { NutritionScreen } from '../screens/nutrition/NutritionScreen';
import { FoodScannerScreen } from '../screens/nutrition/FoodScannerScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { NewsScreen } from '../screens/news/NewsScreen';
import { AIChatScreen } from '../screens/ai/AIChatScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const WorkoutsStack = createNativeStackNavigator();
const NutritionStack = createNativeStackNavigator();

// Tab icon component
const TabIcon: React.FC<{ label: string; emoji: string; focused: boolean }> = ({ label, emoji, focused }) => {
  const { colors } = useThemeStore();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={[typography.tabLabel, { color: focused ? colors.tabBarActive : colors.tabBarInactive, marginTop: 2 }]}>
        {label}
      </Text>
    </View>
  );
};

// Workouts Stack
function WorkoutsStackNavigator() {
  return (
    <WorkoutsStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkoutsStack.Screen name="WorkoutsList" component={WorkoutsScreen} />
      <WorkoutsStack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
      <WorkoutsStack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <WorkoutsStack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
      <WorkoutsStack.Screen name="CustomWorkout" component={CustomWorkoutScreen} />
    </WorkoutsStack.Navigator>
  );
}

// Nutrition Stack
function NutritionStackNavigator() {
  return (
    <NutritionStack.Navigator screenOptions={{ headerShown: false }}>
      <NutritionStack.Screen name="NutritionMain" component={NutritionScreen} />
      <NutritionStack.Screen name="FoodScanner" component={FoodScannerScreen} />
    </NutritionStack.Navigator>
  );
}

// Main Tab Navigator
function MainTabs() {
  const { colors } = useThemeStore();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 25,
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
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Профиль" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Auth Stack
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isOnboarded } = useAuthStore();
  const { colors } = useThemeStore();

  // Request notification permissions once on first authenticated launch
  useEffect(() => {
    if (isAuthenticated && isOnboarded) {
      requestNotificationPermissions();
    }
  }, [isAuthenticated, isOnboarded]);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !isOnboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
