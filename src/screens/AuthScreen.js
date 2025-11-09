// src/screens/AuthScreen.js
import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { auth } from "../../supabase";
import Screen from '../components/Screen';
import Logo from '../components/Logo';
import theme from '../theme';

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const containerAnim = useRef(new Animated.Value(0)).current;
  const input1Anim = useRef(new Animated.Value(0)).current;
  const input2Anim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered animations for a polished feel
    Animated.sequence([
      Animated.timing(containerAnim, { 
        toValue: 1, 
        duration: 400, 
        useNativeDriver: true 
      }),
      Animated.timing(input1Anim, { 
        toValue: 1, 
        duration: 300, 
        useNativeDriver: true 
      }),
      Animated.timing(input2Anim, { 
        toValue: 1, 
        duration: 300, 
        useNativeDriver: true 
      }),
      Animated.spring(buttonAnim, { 
        toValue: 1, 
        friction: 6, 
        tension: 40,
        useNativeDriver: true 
      }),
    ]).start();
  }, []);

  const signup = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await auth.signUp(email.trim(), password);
      if (error) throw error;
      Alert.alert("Success!", "Account created! Please check your email.");
    } catch (e) {
      Alert.alert("Signup error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await auth.signIn(email.trim(), password);
      if (error) throw error;
    } catch (e) {
      Alert.alert("Login error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const buttonScale = buttonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <Screen noPadding>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View 
            style={[
              styles.logoContainer,
              { 
                opacity: containerAnim,
                transform: [{ 
                  translateY: containerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  })
                }]
              }
            ]}
          >
            <Logo size="large" animated={true} />
          </Animated.View>

          <View style={styles.formContainer}>
            <Animated.View 
              style={[
                styles.inputContainer,
                {
                  opacity: input1Anim,
                  transform: [{
                    translateX: input1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-30, 0],
                    })
                  }]
                }
              ]}
            >
              <TextInput 
                placeholder="Email" 
                value={email} 
                onChangeText={setEmail} 
                style={styles.input} 
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={theme.colors.muted}
              />
            </Animated.View>

            <Animated.View 
              style={[
                styles.inputContainer,
                {
                  opacity: input2Anim,
                  transform: [{
                    translateX: input2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-30, 0],
                    })
                  }]
                }
              ]}
            >
              <TextInput 
                placeholder="Password" 
                value={password} 
                onChangeText={setPassword} 
                style={styles.input} 
                secureTextEntry
                autoCapitalize="none"
                placeholderTextColor={theme.colors.muted}
              />
            </Animated.View>

            <Animated.View 
              style={[
                styles.buttonContainer,
                {
                  opacity: buttonAnim,
                  transform: [{ scale: buttonScale }]
                }
              ]}
            >
              <TouchableOpacity 
                onPress={login} 
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryText}>
                  {loading ? 'Loading...' : 'Log in'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={signup} 
                style={styles.ghostBtn}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.ghostText}>Sign up</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  logoContainer: {
    marginBottom: 48,
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonContainer: {
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  ghostBtn: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
});
