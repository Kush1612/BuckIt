// App.js
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import AddItemScreen from "./src/screens/AddItemScreen";
import ItemDetailScreen from "./src/screens/ItemDetailScreen";
import MemoriesScreen from "./src/screens/MemoriesScreen";
import GalleryScreen from "./src/screens/GalleryScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import Constants from 'expo-constants';
import { auth, initSupabase, isSupabaseInitialized } from "./supabase";
import { Ionicons } from '@expo/vector-icons';

const Stack = createNativeStackNavigator();
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
const Tab = createBottomTabNavigator();

function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="AddItem" component={AddItemScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
    </Stack.Navigator>
  );
}

function MemoriesStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MemoriesList" component={MemoriesScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
    </Stack.Navigator>
  );
}

function GalleryStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GalleryList" component={GalleryScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  // Try to initialize Supabase at runtime from Expo config or environment if not auto-initialized
  if (!isSupabaseInitialized()) {
    const expoExtra = (Constants && (Constants.manifest?.extra || Constants.expoConfig?.extra)) || {};
    const url = process.env.SUPABASE_URL || expoExtra.SUPABASE_URL || expoExtra.supabaseUrl || null;
    const key = process.env.SUPABASE_ANON_KEY || expoExtra.SUPABASE_ANON_KEY || expoExtra.supabaseAnonKey || null;
    if (url && key) {
      try { initSupabase(url, key); } catch (e) { /* fall through to error UI below */ }
    }
  }

  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // if still not initialized, show an instructive error screen instead of running network requests
  if (!isSupabaseInitialized()) {
    return (
      <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:20}}>
        <Text style={{fontSize:18,fontWeight:'700',marginBottom:12}}>Supabase not configured</Text>
        <Text style={{textAlign:'center',marginBottom:12}}>Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment or in <Text style={{fontWeight:'700'}}>app.json</Text> under <Text style={{fontWeight:'700'}}>expo.extra</Text>.</Text>
        <Text style={{fontSize:12,color:'#666'}}>{`Example in app.json:\n\n"expo": {\n  "extra": {\n    "SUPABASE_URL": "https://your-project.supabase.co",\n    "SUPABASE_ANON_KEY": "your-anon-key"\n  }\n}`}</Text>
      </View>
    );
  }

  useEffect(() => {
    let mounted = true;
    // get current user
    auth.getUser().then(res => {
      const user = res?.data?.user ?? null;
      if (mounted) {
        setUser(user);
        if (initializing) setInitializing(false);
      }
    });

    // subscribe to auth changes
    const unsub = auth.onAuthStateChange((u) => {
      setUser(u);
      if (initializing) setInitializing(false);
    });
    return () => {
      mounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  if (initializing) return null;

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator>
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      ) : (
        <Tab.Navigator 
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;
              
              if (route.name === 'HomeTab') {
                iconName = focused ? 'home' : 'home-outline';
              } else if (route.name === 'Add') {
                iconName = focused ? 'add-circle' : 'add-circle-outline';
              } else if (route.name === 'MemoriesTab') {
                iconName = focused ? 'heart' : 'heart-outline';
              } else if (route.name === 'GalleryTab') {
                iconName = focused ? 'images' : 'images-outline';
              } else if (route.name === 'Profile') {
                iconName = focused ? 'person' : 'person-outline';
              }
              
              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#ff7b9c',
            tabBarInactiveTintColor: 'gray',
          })}
        >
          <Tab.Screen name="HomeTab" component={HomeStackNavigator} options={{ title: 'Home' }} />
          <Tab.Screen name="Add" component={AddItemScreen} options={{ title: 'Add' }} />
          <Tab.Screen name="MemoriesTab" component={MemoriesStackNavigator} options={{ title: 'Memories' }} />
          <Tab.Screen name="GalleryTab" component={GalleryStackNavigator} options={{ title: 'Gallery' }} />
          <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}
