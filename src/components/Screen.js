import React, { useEffect, useRef } from 'react';
import { SafeAreaView, View, Animated, StatusBar, Platform } from 'react-native';
import theme from '../theme';

// Enhanced Screen wrapper with consistent margins, safe area handling, and animations
export default function Screen({ children, style, noPadding = false }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const padding = noPadding ? 0 : 16;
  const paddingTop = noPadding ? 0 : Platform.OS === 'ios' ? 8 : 16;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />
      <Animated.View 
        style={[
          { 
            flex: 1, 
            padding, 
            paddingTop,
            opacity: fadeAnim,
          }, 
          style
        ]}
      >
        {children}
      </Animated.View>
    </SafeAreaView>
  );
}
