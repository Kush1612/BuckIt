// src/components/ItemCard.js
import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated } from "react-native";
import theme from '../theme';

export default function ItemCard({ item, onPress, index = 0 }) {
  const thumb = (item.photosResolved && item.photosResolved.length > 0) ? item.photosResolved[0] : (item.photos && item.photos.length > 0 ? item.photos[0] : null);
  const anim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  useEffect(() => {
    // Staggered entrance animation based on index
    Animated.parallel([
      Animated.timing(anim, { 
        toValue: 1, 
        duration: 400,
        delay: index * 50, // Stagger based on index
        useNativeDriver: true 
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const categoryEmoji = {
    'Travel': '✈️',
    'Food': '🍔',
    'Adventure': '🏔️',
    'Goals': '🎯',
    'Cute': '💕',
  }[item.category] || '📝';

  return (
    <Animated.View 
      style={[
        styles.wrapper, 
        { 
          opacity: anim, 
          transform: [
            { translateY: anim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) },
            { scale: scaleAnim }
          ] 
        }
      ]}
    >
      <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.8}>
        {thumb ? (
          <Image 
            source={{ uri: thumb }} 
            style={styles.thumb}
            onError={(e) => console.warn('ItemCard image error:', thumb, e.nativeEvent.error)}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderEmoji}>{categoryEmoji}</Text>
          </View>
        )}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            {item.secret && (
              <View style={styles.secretBadge}>
                <Text style={styles.secretText}>🔒</Text>
              </View>
            )}
          </View>
          <View style={styles.categoryRow}>
            <Text style={styles.categoryEmoji}>{categoryEmoji}</Text>
            <Text style={styles.cat}>{item.category}</Text>
          </View>
          {item.description && (
            <Text numberOfLines={2} style={styles.desc}>{item.description}</Text>
          )}
        </View>
        <View style={styles.statusContainer}>
          {item.completed ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completed}>✓</Text>
            </View>
          ) : (
            <View style={styles.pendingBadge}>
              <Text style={styles.pending}>⋯</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { 
    marginHorizontal: 12, 
    marginVertical: 8,
  },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  thumb: { 
    width: 80, 
    height: 80, 
    borderRadius: 12, 
    backgroundColor: '#eee',
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  placeholder: { 
    width: 80, 
    height: 80, 
    borderRadius: 12, 
    backgroundColor: theme.colors.accent, 
    borderWidth: 2, 
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 32,
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: { 
    fontWeight: '800', 
    fontSize: 17, 
    color: theme.colors.text,
    flex: 1,
    letterSpacing: -0.3,
  },
  secretBadge: {
    marginLeft: 8,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  secretText: {
    fontSize: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  cat: { 
    fontSize: 13, 
    color: theme.colors.muted, 
    fontWeight: '600',
  },
  desc: { 
    fontSize: 13, 
    color: '#666', 
    marginTop: 4,
    lineHeight: 18,
  },
  statusContainer: {
    justifyContent: 'center',
    marginLeft: 8,
  },
  completedBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  completed: { 
    color: '#4CAF50', 
    fontWeight: '800',
    fontSize: 18,
  },
  pendingBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: { 
    color: theme.colors.primary,
    fontWeight: '800',
    fontSize: 20,
  },
});
