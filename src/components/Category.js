// src/components/Category.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import theme from '../theme';

export default function Category({ categories, selected, onSelect }) {
  const categoryEmojis = {
    'All': '🌟',
    'Travel': '✈️',
    'Food': '🍔',
    'Adventure': '🏔️',
    'Goals': '🎯',
    'Cute': '💕',
  };

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {categories.map(cat => (
        <TouchableOpacity
          key={cat}
          onPress={() => onSelect(cat)}
          style={[styles.chip, selected === cat && styles.chipActive]}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{categoryEmojis[cat] || '📝'}</Text>
          <Text style={[styles.text, selected === cat && styles.textActive]}>
            {cat}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
  },
  contentContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginRight: 10,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.primary,
    borderWidth: 2,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  emoji: {
    fontSize: 16,
    marginRight: 6,
  },
  text: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  textActive: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
});
