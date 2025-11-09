import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import theme from '../theme';

export default function Logo({ size = 'large', showTagline = true, animated = true }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [animated]);

  const fontSize = size === 'large' ? 36 : size === 'medium' ? 28 : 20;
  const heartSize = size === 'large' ? 32 : size === 'medium' ? 24 : 18;

  const heartRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: scaleAnim }, { rotate: heartRotation }],
          },
        ]}
      >
        <Text style={[styles.logoText, { fontSize }]}>
          Buck<Text style={styles.heart}>❤️</Text>It
        </Text>
      </Animated.View>
      {showTagline && (
        <Animated.View style={{ opacity: scaleAnim }}>
          <Text style={styles.tagline}>A small bucket list for two</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontWeight: '900',
    color: theme.colors.primaryDark,
    letterSpacing: -0.5,
  },
  heart: {
    color: theme.colors.primary,
  },
  tagline: {
    textAlign: 'center',
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: 4,
    fontStyle: 'italic',
  },
});

