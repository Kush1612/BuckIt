// src/screens/HomeScreen.js
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, LayoutAnimation, Platform, UIManager, Modal, TextInput, ScrollView, Alert, Animated } from "react-native";
import { useFocusEffect } from '@react-navigation/native';
import { db, auth, storage } from "../../supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';
import ItemCard from "../components/ItemCard";
import CategoryTabs from "../components/CategoryTabs";
import theme from '../theme';
import Screen from '../components/Screen';


const categories = ["All", "Travel", "Food", "Adventure", "Goals", "Cute"];

export default function HomeScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [userObj, setUserObj] = useState(null);
  const [profile, setProfile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeList, setActiveList] = useState(null);
  const [joinedLists, setJoinedLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'join'
  const [modalValue, setModalValue] = useState('');

  const loadUserProfile = useCallback(async () => {
    try {
      const res = await auth.getUser();
      const user = res?.data?.user ?? null;
      setUserObj(user);

      if (user?.id) {
        try {
          const profileKey = `profile_${user.id}`;
          const p = await AsyncStorage.getItem(profileKey);
          if (p) {
            setProfile(JSON.parse(p));
          } else {
            setProfile(null);
          }
        } catch (e) {
          console.warn('Error loading profile:', e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    } catch (e) {
      console.warn('Error getting user:', e);
      setUserObj(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    loadUserProfile();

    const unsubscribe = auth.onAuthStateChange((user) => {
      setUserObj(user);
      if (user?.id) {
        (async () => {
          try {
            const profileKey = `profile_${user.id}`;
            const p = await AsyncStorage.getItem(profileKey);
            if (p) {
              setProfile(JSON.parse(p));
            } else {
              setProfile(null);
            }
          } catch (e) {
            console.warn('Error loading profile on auth change:', e);
            setProfile(null);
          }
        })();
      } else {
        setProfile(null);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadUserProfile]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('active_list');
        if (stored) setActiveList(JSON.parse(stored));
        else setActiveList(null);
      } catch (e) {
        setActiveList(null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setListsLoading(true);
        const storedJoined = await AsyncStorage.getItem('joined_lists');
        let joined = storedJoined ? JSON.parse(storedJoined) : [];
        if (activeList && !joined.find(l => l === activeList.id)) {
          joined = [activeList.id, ...joined];
        }

        let lists = [];
        if (joined.length > 0) {
          const { data, error } = await db.from('lists').select('*').in('id', joined);
          if (!error) lists = data || [];
        }

        const user = await auth.getUser().then(r => r?.data?.user).catch(() => null);
        if (user?.email) {
          const { data: owned, error: ownedErr } = await db.from('lists').select('*').eq('owner', user.email);
          if (!ownedErr && owned && owned.length) {
            const ownedFiltered = owned.filter(o => !lists.find(l => l.id === o.id));
            lists = [...ownedFiltered, ...lists];
          }
        }

        setJoinedLists(lists);
      } catch (e) {
        console.warn('Error loading joined lists', e);
        setJoinedLists([]);
      } finally {
        setListsLoading(false);
      }
    })();
  }, [activeList]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      try { UIManager.setLayoutAnimationEnabledExperimental(true); } catch (e) {}
    }
  }, []);

  const sharedId = activeList?.id || null;

  const fetchItems = async () => {
    try {
      if (!refreshing) setLoading(true);
      if (!sharedId) {
        setItems([]);
        return;
      }
      const { data, error } = await db.from('items').select('*').eq('list_id', sharedId).order('created_at', { ascending: false });
      if (error) {
        console.warn('Fetch items error', error);
        setItems([]);
      } else {
        const resolved = await Promise.all((data || []).map(async d => {
          const photos = d.photos || [];
          const itemId = d.id;
          const photosResolved = await Promise.all(photos.map(async p => {
            if (!p) return null;
            if (p.startsWith('http')) return p;
            let resolved = null;
            try {
              resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${itemId}/${p}`, 60 * 60);
              if (resolved?.url && !resolved?.error) return resolved.url;
            } catch (e) {}
            try {
              resolved = await storage.bucket('memories').resolveUrl(`${sharedId}/${p}`, 60 * 60);
              if (resolved?.url && !resolved?.error) return resolved.url;
            } catch (e) {}
            if (p.startsWith(itemId)) {
              const filenameWithoutItemId = p.replace(new RegExp(`^${itemId}[_-]?`), '');
              if (filenameWithoutItemId && filenameWithoutItemId !== p) {
                try {
                  const cleanPath = `${sharedId}/${itemId}/${filenameWithoutItemId}`.replace(/\/+/g, '/');
                  resolved = await storage.bucket('memories').resolveUrl(cleanPath, 60 * 60);
                  if (resolved?.url && !resolved?.error) return resolved.url;
                } catch (e) {}
              }
            }
            console.warn('Failed to resolve URL for photo in HomeScreen:', p, 'listId:', sharedId, 'itemId:', itemId);
            return null;
          }));
          return { ...d, photosResolved: photosResolved.filter(Boolean) };
        }));
        const safeResolved = (resolved || []).map((r, idx) => ({ ...r, id: r.id ?? String(idx) }));
        setItems(safeResolved);
      }
    } catch (e) {
      console.warn('Fetch failed', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const saveActiveList = async (list) => {
    setActiveList(list);
    try { await AsyncStorage.setItem('active_list', JSON.stringify(list)); } catch (e) {}
    try { await fetchItems(); } catch (e) {}
  };

  const saveJoinedListId = async (id) => {
    try {
      const stored = await AsyncStorage.getItem('joined_lists');
      const arr = stored ? JSON.parse(stored) : [];
      if (!arr.includes(id)) {
        const next = [id, ...arr];
        await AsyncStorage.setItem('joined_lists', JSON.stringify(next));
      }
    } catch (e) { console.warn('saveJoinedListId failed', e); }
  };

  const createList = async (name) => {
    if (!name || !name.trim()) return Alert.alert('Enter a list name');
    try {
      const user = await auth.getUser().then(r => r?.data?.user).catch(() => null);
      const code = Math.random().toString(36).slice(2,8).toUpperCase();
      const payload = { name: name.trim(), owner: user?.email || null, invite_code: code };
      const { data, error } = await db.from('lists').insert([payload]).select().single();
      if (error) throw error;
      await saveJoinedListId(data.id);
      // ensure joinedLists updates immediately so UI shows text correctly
      setJoinedLists(prev => {
        const exists = prev.find(l => l.id === data.id);
        if (exists) return prev;
        return [data, ...prev];
      });
      await saveActiveList(data);
      setModalVisible(false);
      setModalValue('');
    } catch (e) {
      console.warn('createList error', e);
      Alert.alert('Error creating list', e.message || String(e));
    }
  };

  const joinListByCode = async (code) => {
    if (!code || !code.trim()) return Alert.alert('Enter invite code');
    try {
      const { data, error } = await db.from('lists').select('*').eq('invite_code', code.trim()).single();
      if (error) throw error;
      await saveJoinedListId(data.id);
      setJoinedLists(prev => {
        const exists = prev.find(l => l.id === data.id);
        if (exists) return prev;
        return [data, ...prev];
      });
      await saveActiveList(data);
      setModalVisible(false);
      setModalValue('');
    } catch (e) {
      console.warn('joinList error', e);
      Alert.alert('Unable to join', 'Code not found or invalid');
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchItems();
    }, [sharedId])
  );

  useEffect(() => {
    if (!sharedId) {
      setItems([]);
      setLoading(false);
      return () => {};
    }

    fetchItems();

    const channel = db.channel('items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${sharedId}` }, (payload) => {
        try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch (e) {}
        fetchItems();
      })
      .subscribe();

    return () => {
      try { channel.unsubscribe(); } catch (e) { console.warn('channel unsubscribe failed', e); }
    };
  }, [sharedId]);

  const filtered = selectedCategory === "All" ? items : items.filter(i => i.category === selectedCategory);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      try {
        await fetchItems();
      } catch (e) {
        console.warn('Refresh failed', e);
        setRefreshing(false);
      }
    })();
  }, [sharedId]);

  return (
    <Screen>
      <Animated.View
        style={[
          styles.headerContainer,
          {
            opacity: 1,
            transform: [{ translateY: 0 }],
          }
        ]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.greeting}>
              Hi {profile?.username ? profile.username : (userObj?.email ? userObj.email.split("@")[0] : 'friend')}
              <Text style={styles.heart}> ❤️</Text>
            </Text>
            <Text style={styles.listName}>
              {activeList ? `📋 ${activeList.name}` : '✨ No active list'}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalMode === 'create' ? '✨ Create a new list' : '🔗 Join a list'}
            </Text>
            <TextInput
              placeholder={modalMode === 'create' ? 'List name' : 'Invite code'}
              value={modalValue}
              onChangeText={setModalValue}
              style={styles.modalInput}
              placeholderTextColor={theme.colors.muted}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCancelBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (modalMode === 'create') createList(modalValue); else joinListByCode(modalValue); }}
                style={styles.modalActionBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.modalActionText}>{modalMode === 'create' ? 'Create' : 'Join'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <View style={styles.contentContainer}>
        <View style={styles.listsSection}>
          <Text style={styles.sectionTitle}>📚 Your lists</Text>
          {listsLoading ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.listsScroll}
              contentContainerStyle={styles.listsScrollContent}
            >
              <TouchableOpacity
                onPress={() => { setModalMode('create'); setModalVisible(true); }}
                style={[styles.listCard, styles.createCard]}
                activeOpacity={0.8}
              >
                <Text style={styles.createCardText}>+ Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setModalMode('join'); setModalVisible(true); }}
                style={[styles.listCard, styles.joinCard]}
                activeOpacity={0.8}
              >
                <Text style={styles.joinCardText}>🔗 Join</Text>
              </TouchableOpacity>
              {joinedLists.map((l, index) => (
                <Animated.View
                  key={l.id ?? index}
                  style={{
                    opacity: 1,
                    transform: [{ scale: 1 }],
                  }}
                >
                  <TouchableOpacity
                    onPress={() => { saveActiveList(l); }}
                    style={[
                      styles.listCard,
                      activeList?.id === l.id && styles.listCardActive
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.listCardName, activeList?.id === l.id && styles.listCardNameActive]}>{l.name}</Text>
                    <Text style={[styles.listCardCode, activeList?.id === l.id && styles.listCardCodeActive]}>{l.invite_code}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ zIndex: 20, elevation: 20, backgroundColor: 'transparent', paddingBottom: 8 }}>
          <CategoryTabs categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
        </View>

        {/* Items list - constrained to contentContainer so it sits between category tabs and footer */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(i, idx) => (i?.id ? String(i.id) : String(idx))}
            renderItem={({ item, index }) => (
              <ItemCard
                item={item}
                onPress={() => navigation.navigate("ItemDetail", { item })}
                index={index}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>✨</Text>
                <Text style={styles.emptyText}>No items yet</Text>
                <Text style={styles.emptySubtext}>Add your first wish to get started!</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => navigation.navigate('AddItem')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyButtonText}>+ Add your first wish</Text>
                </TouchableOpacity>
              </View>
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 140, paddingTop: 8 }}
          />
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate("AddItem")}>
          <Text style={styles.btnText}>+ Add Wish</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accent,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  heart: {
    color: theme.colors.primary,
  },
  listName: {
    fontSize: 14,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 4,
  },
  listsSection: {
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 8,
    color: theme.colors.text,
  },
  listsScroll: {
    marginHorizontal: 0,
  },
  listsScrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  listCard: {
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  createCard: {
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  createCardText: {
    fontWeight: '700',
    color: '#ffffff',
    fontSize: 16,
  },
  joinCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  joinCardText: {
    fontWeight: '700',
    color: theme.colors.primaryDark,
    fontSize: 16,
  },
  listCardActive: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  listCardName: {
    fontWeight: '700',
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  listCardNameActive: {
    color: '#ffffff',
  },
  listCardCode: {
    fontSize: 11,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  listCardCodeActive: {
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 20,
    color: theme.colors.primaryDark,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalCancelText: {
    color: theme.colors.muted,
    fontWeight: '600',
    fontSize: 16,
  },
  modalActionBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    paddingBottom: 28,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.accent,
    zIndex: 30,
    elevation: 30,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
