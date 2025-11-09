// src/screens/MemoriesScreen.js
import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Modal, RefreshControl, ActivityIndicator } from "react-native";
import { db, storage } from "../../supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../theme';
import Screen from '../components/Screen';
import { useNavigation } from '@react-navigation/native';

export default function MemoriesScreen() {
  const [memories, setMemories] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const fetchMemories = useCallback(async () => {
    const stored = await AsyncStorage.getItem('active_list');
    const list = stored ? JSON.parse(stored) : null;
    const sharedId = list?.id || null;
    if (!sharedId) { setMemories([]); setRefreshing(false); return; }
    const { data, error } = await db.from('items').select('*').eq('list_id', sharedId).order('created_at', { ascending: false });
    if (error) {
      console.warn('memories fetch error', error);
      setMemories([]);
      setRefreshing(false);
      return;
    }
    const rows = (data || []).filter(d => d.completed || (d.memories && d.memories.length));
    // resolve photo filenames to public URLs and map memories' file -> url
    const resolved = await Promise.all(rows.map(async (d) => {
      const photos = (d.photos || []).map(p => p);
      const photosResolved = await Promise.all(photos.map(async p => {
        if (!p) return null;
        if (p.startsWith('http')) return p;
        const itemId = d.id;
        let resolved = null;
        
        // Try multiple path formats to handle different storage structures
        // Try: listId/itemId/filename (nested structure)
        try {
          resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${itemId}/${p}`, 60 * 60);
          if (resolved?.url && !resolved?.error) {
            return resolved.url;
          }
        } catch (e) {
          // Try next format
        }
        
        // Try: listId/filename (flat structure)
        try {
          resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${p}`, 60 * 60);
          if (resolved?.url && !resolved?.error) {
            return resolved.url;
          }
        } catch (e) {
          // Try next format
        }
        
        // If filename starts with itemId, try without it in nested path
        if (p.startsWith(itemId)) {
          const filenameWithoutItemId = p.replace(new RegExp(`^${itemId}[_-]?`), '');
          if (filenameWithoutItemId && filenameWithoutItemId !== p) {
            try {
              const cleanPath = `${sharedId}/${itemId}/${filenameWithoutItemId}`.replace(/\/+/g, '/'); // Remove double slashes
              resolved = await storage.bucket('memories').resolveUrl(cleanPath, 60 * 60);
              if (resolved?.url && !resolved?.error) {
                return resolved.url;
              }
            } catch (e) {
              // Failed
            }
          }
        }
        
        console.warn('Failed to resolve URL for photo in memories:', p, 'listId:', sharedId, 'itemId:', itemId);
        return null; // Return null for failed resolutions
      }));

      const memoriesArr = (d.memories || []).map(m => ({ ...m }));
      // if memories entries reference file, resolve url too
      await Promise.all(memoriesArr.map(async (m) => {
        if (m.file && !m.url) {
          try {
            const r = await storage.bucket('memories').resolveUrl(`${sharedId}/${m.file}`, 60 * 60);
            m.url = r?.url || null;
          } catch (e) { m.url = null; }
        }
        return m;
      }));

      return { ...d, photosResolved: photosResolved.filter(Boolean), memories: memoriesArr };
    }));

    setMemories(resolved);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMemories();
  }, [fetchMemories]);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('active_list');
      const list = stored ? JSON.parse(stored) : null;
      const sharedId = list?.id || null;
      
      fetchMemories();

      const channel = db.channel('items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${sharedId}` }, () => fetchMemories())
        .subscribe();

      return () => { try { channel.unsubscribe(); } catch (e) {} };
    })();
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💝 Memories</Text>
        <Text style={styles.headerSubtitle}>Completed wishes and moments</Text>
      </View>
      <FlatList
        data={memories}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => navigation.navigate('ItemDetail', { item })}
            activeOpacity={0.7}
          >
            <Text style={{fontWeight:"700",fontSize:18,marginBottom:4}}>{item.title}</Text>
            <Text style={{color:"#777",marginBottom:8}}>{item.category}</Text>
            
            {/* Display all photos in a horizontal scroll */}
            {item.photosResolved && item.photosResolved.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:8}}>
                {item.photosResolved.map((photoUri, idx) => (
                  <TouchableOpacity key={idx} onPress={() => setSelectedImage(photoUri)}>
                    <Image 
                      source={{uri: photoUri}} 
                      style={styles.img}
                      onError={(e) => console.warn('Image load error:', e.nativeEvent.error)}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            
            {/* Display memory notes */}
            {item.memories && item.memories.length > 0 && (
              <View style={{marginTop:8}}>
                <Text style={{fontWeight:'600',fontSize:14,marginBottom:4}}>Notes:</Text>
                {item.memories.map((m, idx) => (
                  <View key={idx} style={{marginBottom:4}}>
                    <Text style={{fontSize:13,color:'#555'}}>{m.note || "—"}</Text>
                    {m.date && <Text style={{fontSize:11,color:'#999'}}>{new Date(m.date).toLocaleDateString()}</Text>}
                  </View>
                ))}
              </View>
            )}
            
            {item.completed && (
              <View style={styles.completedBadge}>
                <Text style={styles.completedText}>✓ Completed</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{padding:20,alignItems:'center'}}>
            <Text style={{color:'#999'}}>No memories yet. Complete wishes to see them here!</Text>
          </View>
        }
      />
      
      {/* Full screen image modal */}
      <Modal visible={!!selectedImage} transparent onRequestClose={() => setSelectedImage(null)}>
        <TouchableOpacity style={styles.modal} onPress={() => setSelectedImage(null)} activeOpacity={1}>
          {selectedImage && (
            <View style={{width:'90%',height:'70%',justifyContent:'center',alignItems:'center'}}>
              <Image 
                source={{uri:selectedImage}} 
                style={styles.fullImg}
                resizeMode="contain"
                onError={(e) => console.warn('Modal image load error:', e.nativeEvent.error)}
              />
            </View>
          )}
        </TouchableOpacity>
      </Modal>
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
  card: {
    padding: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  img: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  completedBadge: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  completedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImg: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
});
