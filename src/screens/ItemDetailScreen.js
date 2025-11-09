// src/screens/ItemDetailScreen.js
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Button, Image, StyleSheet, TextInput, Alert, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { db, storage } from "../../supabase";
import * as ImagePicker from "expo-image-picker";
import theme from '../theme';
import Screen from '../components/Screen';
import { addPendingUpload } from '../utils/optimisticUploads';
import { getPendingForList, removePendingByFile } from '../utils/optimisticUploads';

export default function ItemDetailScreen({ route, navigation }) {
  const { item: initialItem } = route.params;
  const [localItem, setLocalItem] = useState(initialItem);
  const [note, setNote] = useState("");
  const [photosResolved, setPhotosResolved] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const listId = localItem?.list_id || initialItem?.list_id || null;

  const refreshItem = useCallback(async () => {
    try {
      const { data: refreshed } = await db.from('items').select('*').eq('id', localItem.id).single();
      if (refreshed) {
        setLocalItem(refreshed);
      }
    } catch (e) {
      console.warn('refresh item error', e);
    } finally {
      setRefreshing(false);
    }
  }, [localItem.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshItem();
  }, [refreshItem]);

  // Resolve filenames to signed URLs (for private bucket) and include optimistic pending uploads
  useEffect(() => {
    if (!listId || !localItem?.id) {
      setPhotosResolved([]);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        const photos = localItem?.photos || [];
        const resolved = [];
        for (const p of photos) {
          if (!p) continue;
          if (p.startsWith('http')) {
            resolved.push({ uri: p, file: p });
            continue;
          }
          // Try multiple path formats to handle different storage structures
          let resolvedUrl = null;
          const itemId = localItem.id;
          
          // Log what we're trying to resolve
          console.log('Resolving photo:', { filename: p, listId, itemId });
          
          // Try: listId/itemId/filename (nested structure) - try this first as it's most common
          const pathsToTry = [
            `${listId}/${itemId}/${p}`,  // nested: listId/itemId/filename
            `${listId}/${p}`,            // flat: listId/filename
          ];
          
          // If filename already includes itemId, also try extracting it
          if (p.includes(itemId) && p !== itemId) {
            // Extract the part after itemId (if filename is like "itemId_timestamp_xxx.jpg")
            const parts = p.split(itemId);
            if (parts.length > 1 && parts[1]) {
              const afterItemId = parts[1].replace(/^[_-]/, ''); // remove leading _ or -
              if (afterItemId) {
                pathsToTry.unshift(`${listId}/${itemId}/${afterItemId}`); // try this first
              }
            }
          }
          
          for (const pathToTry of pathsToTry) {
            try {
              console.log('  Trying path:', pathToTry);
              resolvedUrl = await storage.bucket('memories').resolveUrl(pathToTry, 60 * 60);
              if (resolvedUrl?.url && !resolvedUrl?.error) {
                console.log('  ✓ Successfully resolved:', pathToTry);
                resolved.push({ uri: resolvedUrl.url, file: p });
                break; // Found it, stop trying
              } else {
                console.log('  ✗ Failed:', pathToTry, resolvedUrl);
              }
            } catch (e) {
              console.log('  ✗ Exception:', pathToTry, e.message);
            }
          }
          
          if (!resolvedUrl?.url || resolvedUrl?.error) {
            console.warn('Failed to resolve URL for photo after trying all paths:', p, 'listId:', listId, 'itemId:', itemId);
          }
        }

        // Attach any optimistic pending uploads for this list and item
        try {
          const pending = await getPendingForList(listId) || [];
          for (const o of pending) {
            if (o.itemId && o.itemId === localItem.id) {
              // avoid duplicates
              if (!resolved.find(r => r.file === o.file)) resolved.unshift({ uri: o.uri, file: o.file, pending: true });
            }
          }
        } catch (e) { /* ignore */ }

        if (mounted) setPhotosResolved(resolved);
      } catch (e) {
        console.warn('Error in photo resolution effect:', e);
        if (mounted) setPhotosResolved([]);
      }
    })();
    return () => { mounted = false; };
  }, [listId, localItem?.id, localItem?.photos?.join(',')]);

  const markComplete = async () => {
    try {
      await db.from('items').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', localItem.id);
      Alert.alert("Marked completed!");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
    if (result.cancelled) return;

    const uri = result.assets ? result.assets[0].uri : result.uri;
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);
    // Use nested path structure: listId/itemId/filename (filename without item ID prefix)
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const path = `${listId}/${localItem.id}/${filename}`;

    // upload to Supabase storage bucket named 'memories'
    const { data: uploadData, error: uploadError } = await storage.bucket('memories').upload(path, fileData, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      console.warn('upload error', uploadError);
      Alert.alert('Upload failed', uploadError.message || String(uploadError));
      return;
    }
    console.log('uploadData', uploadData);

    // generate a signed url for optimistic display (private bucket flow)
    let optimisticUrl = null;
    try {
      const resolved = await storage.bucket('memories').resolveUrl(path, 60 * 60);
      optimisticUrl = resolved?.url || null;
    } catch (e) {
      optimisticUrl = null;
    }

    // register optimistic upload so Item view and Gallery show photo immediately
    try {
      await addPendingUpload(listId, filename, optimisticUrl || uri, new Date().toISOString(), localItem.title, localItem.id);
    } catch (e) { /* ignore */ }

    // read existing item and append (store filename, not full public URL)
    const { data: existing, error: readErr } = await db.from('items').select('*').eq('id', localItem.id).single();
    if (readErr) throw readErr;
    const photos = existing?.photos || [];
    const memoriesArr = existing?.memories || [];

    const { data: updated, error: updateErr } = await db.from('items').update({
      photos: [...photos, filename],
      memories: [...memoriesArr, { file: filename, note, date: new Date().toISOString() }]
    }).eq('id', localItem.id).select().single();
    if (updateErr) {
      console.warn('db update error', updateErr);
      Alert.alert('DB update failed', updateErr.message || String(updateErr));
      return;
    }
    console.log('db update result', updated);

    // refresh local item so UI reflects new filenames (and we will resolve signed URLs in effect)
    try {
      const { data: refreshed } = await db.from('items').select('*').eq('id', localItem.id).single();
        if (refreshed) {
          // remove pending entry (it will be removed in Gallery fetch too but do it here)
          try { await removePendingByFile(listId, filename); } catch (e) { /* ignore */ }
          setLocalItem(refreshed);
          Alert.alert("Uploaded photo!");
        } else {
          Alert.alert("Uploaded photo! (refresh failed)");
        }
    } catch (e) {
      Alert.alert("Uploaded photo! (couldn't refresh)");
    }
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{localItem?.title}</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{localItem?.category || 'Uncategorized'}</Text>
          </View>
        </View>
        
        {localItem?.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>{localItem?.description}</Text>
          </View>
        )}

        <View style={styles.actionsSection}>
          <Text style={styles.sectionLabel}>📝 Add Memory</Text>
          <TextInput 
            placeholder="Add a memory note (optional)" 
            placeholderTextColor={theme.colors.muted}
            value={note} 
            onChangeText={setNote} 
            style={styles.input}
            multiline
          />
          <TouchableOpacity onPress={pickAndUpload} style={styles.uploadBtn} activeOpacity={0.8}>
            <Text style={styles.uploadText}>📸 Upload Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.completionSection}>
          {!localItem?.completed ? (
            <TouchableOpacity onPress={markComplete} style={styles.cta} activeOpacity={0.8}>
              <Text style={styles.ctaText}>✅ Mark as completed</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.completedBadge}>
              <Text style={styles.completedText}>✨ Completed ✓</Text>
            </View>
          )}
        </View>

        {(photosResolved && photosResolved.length > 0) && (
          <View style={styles.photosSection}>
            <Text style={styles.sectionLabel}>📷 Photos</Text>
            <View style={styles.photosGrid}>
              {photosResolved.map((p,idx) => (
                <View key={idx} style={styles.photoItem}>
                  <Image 
                    source={{uri:p.uri}} 
                    style={[styles.photoImage, p.pending && styles.photoImagePending]} 
                  />
                  {p.pending && (
                    <View style={styles.uploadingBadgeItem}>
                      <Text style={styles.uploadingTextItem}>Uploading…</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  categoryText: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  descriptionContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  description: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  actionsSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  sectionLabel: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#fff',
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  uploadBtn: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  completionSection: {
    marginBottom: 24,
  },
  cta: {
    backgroundColor: theme.colors.primaryDark,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  completedBadge: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  completedText: {
    color: '#4CAF50',
    fontWeight: '700',
    fontSize: 16,
  },
  photosSection: {
    marginBottom: 24,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 12,
  },
  photoItem: {
    position: 'relative',
    width: '48%',
    aspectRatio: 1.2,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  photoImagePending: {
    opacity: 0.7,
  },
  uploadingBadgeItem: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: 'rgba(255, 123, 156, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  uploadingTextItem: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
