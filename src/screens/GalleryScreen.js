// src/screens/GalleryScreen.js
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, FlatList, Image, TouchableOpacity, Modal, StyleSheet, Text, RefreshControl, Animated } from "react-native";
import { db, storage } from "../../supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../theme';
import Screen from '../components/Screen';
import { getPendingForList, removePendingByFile } from '../utils/optimisticUploads';

export default function GalleryScreen() {
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGallery = useCallback(async () => {
    const stored = await AsyncStorage.getItem('active_list');
    const list = stored ? JSON.parse(stored) : null;
    const sharedId = list?.id || null;
    if (!sharedId) { setPhotos([]); setRefreshing(false); return; }
    const { data, error } = await db.from('items').select('*').eq('list_id', sharedId);
    if (error) {
      console.warn('gallery fetch error', error);
      setPhotos([]);
      setRefreshing(false);
      return;
    }

    // Build months -> days -> photos structure. Use signed urls for private buckets.
    const monthsMap = {}; // { '2025-11': { monthLabel, days: { '2025-11-07': [...] } } }

    // Helper to ensure day exists
    const ensureDay = (day) => {
      const monthKey = day.slice(0,7);
      if (!monthsMap[monthKey]) {
        const dt = new Date(day + 'T00:00:00Z');
        const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(dt);
        monthsMap[monthKey] = { monthKey, monthLabel, days: {} };
      }
      if (!monthsMap[day.slice(0,7)].days[day]) monthsMap[day.slice(0,7)].days[day] = [];
      return monthsMap[day.slice(0,7)].days[day];
    };

    // Resolve DB photos and add to monthsMap
    for (const d of (data || [])) {
      const photos = d.photos || [];
      for (const p of photos) {
        // default to filename string
        let uri = p;
        if (!p.startsWith('http')) {
          let resolved = null;
          const itemId = d.id;
          
          // Try multiple path formats to handle different storage structures
          // Try: listId/itemId/filename (nested structure)
          try {
            resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${itemId}/${p}`, 60 * 60);
            if (resolved?.url && !resolved?.error) {
              uri = resolved.url;
            } else {
              resolved = null;
            }
          } catch (e) {
            // Try next format
          }
          
          // Try: listId/filename (flat structure)
          if (!resolved?.url) {
            try {
              resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${p}`, 60 * 60);
              if (resolved?.url && !resolved?.error) {
                uri = resolved.url;
              } else {
                resolved = null;
              }
            } catch (e) {
              // Both failed
            }
          }
          
          // If filename starts with itemId, try without it in nested path
          if (!resolved?.url && p.startsWith(itemId)) {
            const filenameWithoutItemId = p.replace(new RegExp(`^${itemId}[_-]?`), '');
            if (filenameWithoutItemId && filenameWithoutItemId !== p) {
              try {
                const cleanPath = `${sharedId}/${itemId}/${filenameWithoutItemId}`.replace(/\/+/g, '/'); // Remove double slashes
                resolved = await storage.bucket('memories').resolveUrl(cleanPath, 60 * 60);
                if (resolved?.url && !resolved?.error) {
                  uri = resolved.url;
                }
              } catch (e) {
                // Failed
              }
            }
          }
          
          if (!resolved?.url) {
            console.warn('Failed to resolve URL for photo in gallery:', p, 'listId:', sharedId, 'itemId:', itemId);
            continue; // Skip photos that can't be resolved
          }
        }

        const mem = (d.memories || []).find(m => m.file === p || m.url === p || m.file === `${p}`);
        const date = mem?.date || d.created_at || new Date().toISOString();
        const day = (date || '').slice(0,10);
        const arr = ensureDay(day);
        arr.push({ uri, id: `${d.id}-${p}`, title: d.title, file: p, date });
        // if this file was previously optimistic, remove it
        try { await removePendingByFile(sharedId, p); } catch (e) { /* ignore */ }
      }
    }

    // Attach optimistic pending uploads for this list (appear immediately)
    try {
      const pending = await getPendingForList(sharedId) || [];
      for (const o of pending) {
        const day = (o.date || new Date().toISOString()).slice(0,10);
        const arr = ensureDay(day);
        // Avoid duplicates if DB already contains the same file
        if (!arr.find(x => x.file === o.file)) {
          arr.unshift({ uri: o.uri, id: `pending-${o.file}-${o.date}`, title: o.title, file: o.file, date: o.date, pending: true });
        }
      }
    } catch (e) { /* ignore optimistic errors */ }

    // convert monthsMap into sorted array (months desc, days desc)
    const months = Object.keys(monthsMap).sort((a,b) => b.localeCompare(a)).map(monthKey => {
      const m = monthsMap[monthKey];
      const daysArr = Object.keys(m.days).sort((a,b) => b.localeCompare(a)).map(dayKey => ({ date: dayKey, dateLabel: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dayKey + 'T00:00:00Z')), photos: m.days[dayKey] }));
      return { monthKey: m.monthKey, monthLabel: m.monthLabel, days: daysArr };
    });

    setPhotos(months);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGallery();
  }, [fetchGallery]);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('active_list');
      const list = stored ? JSON.parse(stored) : null;
      const sharedId = list?.id || null;
      
      fetchGallery();

      const channel = db.channel('items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${sharedId}` }, () => fetchGallery())
        .subscribe();

      return () => { try { channel.unsubscribe(); } catch (e) {} };
    })();
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📸 Gallery</Text>
        <Text style={styles.headerSubtitle}>Your memories collection</Text>
      </View>
      <FlatList
        data={photos}
        keyExtractor={(m) => m.monthKey}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        renderItem={({item: month, index: monthIndex}) => (
          <MonthItem month={month} index={monthIndex} onPhotoPress={setOpen} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No photos yet</Text>
            <Text style={styles.emptySubtext}>Upload photos to your wishes to see them here</Text>
          </View>
        }
      />
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        {open && (
          <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => setOpen(null)}>
            <Image source={{ uri: open }} style={styles.fullImg} resizeMode="contain" />
          </TouchableOpacity>
        )}
      </Modal>
    </Screen>
  );
}

function MonthItem({ month, index, onPhotoPress }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [index]);

  return (
    <Animated.View style={[styles.monthContainer, { opacity: fadeAnim }]}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthLabel}>{month.monthLabel}</Text>
        <View style={styles.monthDivider} />
      </View>
      {month.days.map(day => (
        <View key={day.date} style={styles.dayContainer}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayNumber}>{new Date(day.date + 'T00:00:00Z').getDate()}</Text>
                    <Text style={styles.dayWeek}>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(day.date + 'T00:00:00Z'))}</Text>
                  </View>
                  <View style={styles.dayLabelContainer}>
                    <Text style={styles.dayLabel}>{day.dateLabel}</Text>
                    <Text style={styles.photoCount}>{day.photos.length} {day.photos.length === 1 ? 'photo' : 'photos'}</Text>
                  </View>
                </View>
                <FlatList
                  data={day.photos}
                  numColumns={3}
                  keyExtractor={(p) => p.id}
                  renderItem={({item}) => (
                    <TouchableOpacity onPress={() => onPhotoPress(item.uri)} activeOpacity={0.8}>
                      <View style={styles.photoContainer}>
                        <Image source={{uri:item.uri}} style={[styles.photoImage, item.pending && styles.photoImagePending]} />
                        {item.pending && (
                          <View style={styles.uploadingBadge}>
                            <Text style={styles.uploadingText}>Uploading…</Text>
                          </View>
                        )}
                        {item.title && (
                          <View style={styles.photoTitleBadge}>
                            <Text style={styles.photoTitleText} numberOfLines={1}>{item.title}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accent,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.muted,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  monthContainer: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  monthHeader: {
    marginBottom: 12
  },
  monthLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 8
  },
  monthDivider: {
    height: 2,
    backgroundColor: theme.colors.accent,
    borderRadius: 1
  },
  dayContainer: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8
  },
  dayBadge: {
    width: 50,
    height: 50,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff'
  },
  dayWeek: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase'
  },
  dayLabelContainer: {
    flex: 1
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2
  },
  photoCount: {
    fontSize: 12,
    color: theme.colors.muted
  },
  photoContainer: {
    width: 110,
    height: 110,
    margin: 4,
    position: 'relative'
  },
  photoImage: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#f0f0f0'
  },
  photoImagePending: {
    opacity: 0.9
  },
  photoTitleBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4
  },
  photoTitleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600'
  },
  uploadingBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: 'rgba(255, 123, 156, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  uploadingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center'
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  full: {
    width: '100%',
    height: '100%'
  }
});

