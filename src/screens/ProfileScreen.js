import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Image, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth, storage, getSupabaseClient } from '../../supabase';
import theme from '../theme';
import Screen from '../components/Screen';

export default function ProfileScreen({ navigation }) {
  const [userEmail, setUserEmail] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [joinedLists, setJoinedLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    const u = await auth.getUser().then(r => r?.data?.user).catch(() => null);
    if (!u?.id) {
      setUserEmail(null);
      setDisplayName('');
      setUsername('');
      setAvatarUri(null);
      setRefreshing(false);
      return;
    }
    setUserEmail(u?.email || null);
    // load profile from AsyncStorage using user-specific key
    try {
      const profileKey = `profile_${u.id}`;
      const profile = await AsyncStorage.getItem(profileKey);
      if (profile) {
        const p = JSON.parse(profile);
        setDisplayName(p.displayName || '');
        setUsername(p.username || '');
        setAvatarUri(p.avatarUri || null);
      } else {
        // No profile found, reset to defaults
        setDisplayName('');
        setUsername('');
        setAvatarUri(null);
      }
    } catch (e) {
      console.warn('Error loading profile:', e);
      setDisplayName('');
      setUsername('');
      setAvatarUri(null);
    }
    // load joined lists and owned lists
    try {
      const stored = await AsyncStorage.getItem('joined_lists');
      const arr = stored ? JSON.parse(stored) : [];
      let lists = [];
      if (arr.length) {
        const { data } = await db.from('lists').select('*').in('id', arr);
        lists = data || [];
      }
      // also load lists owned by current user
      if (u?.email) {
        const { data: owned } = await db.from('lists').select('*').eq('owner', u.email);
        if (owned && owned.length) {
          // merge owned lists, avoiding duplicates
          const ownedFiltered = owned.filter(o => !lists.find(l => l.id === o.id));
          lists = [...ownedFiltered, ...lists];
        }
      }
      setJoinedLists(lists);
    } catch (e) { console.warn('load joined lists', e); }
    const active = await AsyncStorage.getItem('active_list');
    if (active) setActiveList(JSON.parse(active));
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Reload profile when screen comes into focus (in case user changed)
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const saveProfile = async () => {
    try {
      const u = await auth.getUser().then(r => r?.data?.user).catch(() => null);
      if (!u?.id) {
        Alert.alert('Error', 'Not logged in');
        return;
      }
      const payload = { displayName: displayName.trim(), username: username.trim(), avatarUri };
      // Store profile with user-specific key
      const profileKey = `profile_${u.id}`;
      await AsyncStorage.setItem(profileKey, JSON.stringify(payload));
      Alert.alert('Saved', 'Profile updated');
    } catch (e) { 
      console.warn('Error saving profile:', e);
      Alert.alert('Error', 'Unable to save profile'); 
    }
  };

  const pickAvatar = async () => {
    try {
      const u = await auth.getUser().then(r => r?.data?.user).catch(() => null);
      if (!u?.id) {
        Alert.alert('Error', 'Not logged in');
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission required'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: true, aspect: [1,1] });
      if (res.cancelled) return;
      const uri = res.assets ? res.assets[0].uri : res.uri;
      
      // Upload avatar to Supabase storage
      try {
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileData = new Uint8Array(arrayBuffer);
        const filename = `avatar_${u.id}_${Date.now()}.jpg`;
        const path = `avatars/${filename}`;
        
        const { error: uploadError } = await storage.bucket('memories').upload(path, fileData, {
          contentType: 'image/jpeg',
          upsert: true // Allow overwriting existing avatars
        });
        
        if (uploadError) {
          console.warn('Avatar upload error:', uploadError);
          // Fallback to local URI if upload fails
          setAvatarUri(uri);
          Alert.alert('Warning', 'Avatar saved locally but upload failed');
        } else {
          // Get signed URL for the uploaded avatar
          const { url: avatarUrl } = await storage.bucket('memories').resolveUrl(path, 60 * 60 * 24 * 365); // 1 year expiry
          if (avatarUrl) {
            setAvatarUri(avatarUrl);
          } else {
            setAvatarUri(uri);
          }
        }
      } catch (uploadErr) {
        console.warn('Avatar upload exception:', uploadErr);
        // Fallback to local URI
        setAvatarUri(uri);
      }
    } catch (e) {
      console.warn('Error picking avatar:', e);
      Alert.alert('Error', 'Failed to pick avatar');
    }
  };

  const copyInvite = async (list) => {
    const link = `bucketus://list/${list.id}`;
    try { await Clipboard.setStringAsync(link); Alert.alert('Copied', link); } catch (e) { Alert.alert('Invite', link); }
  };

  const removeListLocally = async (id) => {
    try {
      const stored = await AsyncStorage.getItem('joined_lists');
      const arr = stored ? JSON.parse(stored) : [];
      const next = arr.filter(x => x !== id);
      await AsyncStorage.setItem('joined_lists', JSON.stringify(next));
      setJoinedLists(prev => prev.filter(p => p.id !== id));
      const active = await AsyncStorage.getItem('active_list');
      if (active) {
        const a = JSON.parse(active);
        if (a.id === id) {
          await AsyncStorage.removeItem('active_list');
          setActiveList(null);
        }
      }
    } catch (e) { console.warn('removeListLocally', e); }
  };

  const deleteOrLeave = async (list) => {
    Alert.alert('Confirm', `Delete / leave "${list.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        try {
          const u = await auth.getUser().then(r => r?.data?.user).catch(() => null);
          if (u?.email && u.email === list.owner) {
            // user owns the list — delete from DB
            const { error } = await db.from('lists').delete().eq('id', list.id);
            if (error) throw error;
          } else {
            // just leave locally
          }
          await removeListLocally(list.id);
          Alert.alert('Done', u?.email === list.owner ? 'List deleted' : 'Left the list');
        } catch (e) {
          console.warn('deleteOrLeave', e);
          Alert.alert('Error', e.message || String(e));
        }
      }}
    ]);
  };

  // Delete demo data helper (removes items, list and storage objects for 'couple_demo')
  const deleteDemoData = async () => {
    Alert.alert('Delete demo data', 'This will remove demo items and files for the demo list. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const sup = getSupabaseClient();
          // delete items rows
          const { error: delItemsErr } = await db.from('items').delete().eq('list_id', 'couple_demo');
          if (delItemsErr) throw delItemsErr;

          // delete demo list row
          const { error: delListErr } = await db.from('lists').delete().eq('id', 'couple_demo');
          if (delListErr) throw delListErr;

          // remove storage files under the prefix 'couple_demo'
          try {
            const { data: files, error: listErr } = await sup.storage.from('memories').list('couple_demo');
            if (!listErr && files && files.length) {
              const paths = files.map(f => `couple_demo/${f.name}`);
              await sup.storage.from('memories').remove(paths);
            }
          } catch (e) {
            // ignore storage removal errors, proceed
            console.warn('storage cleanup failed', e);
          }

          // clean local references
          try {
            const stored = await AsyncStorage.getItem('joined_lists');
            const arr = stored ? JSON.parse(stored) : [];
            const next = arr.filter(x => x !== 'couple_demo');
            await AsyncStorage.setItem('joined_lists', JSON.stringify(next));
            const active = await AsyncStorage.getItem('active_list');
            if (active) {
              const a = JSON.parse(active);
              if (a.id === 'couple_demo') await AsyncStorage.removeItem('active_list');
            }
          } catch (e) { /* ignore */ }

          Alert.alert('Done', 'Demo data removed');
          // refresh joined lists
          try { const stored = await AsyncStorage.getItem('joined_lists'); const arr = stored ? JSON.parse(stored) : []; if (arr.length) { const { data } = await db.from('lists').select('*').in('id', arr); setJoinedLists(data || []);} else setJoinedLists([]); } catch (e) { setJoinedLists([]); }
        } catch (e) {
          console.warn('deleteDemoData', e);
          Alert.alert('Error', e.message || String(e));
        }
      }}
    ]);
  };

  const setActive = async (l) => {
    try {
      await AsyncStorage.setItem('active_list', JSON.stringify(l));
      setActiveList(l);
      Alert.alert('Active list set', l.name);
    } catch (e) { console.warn('setActive', e); }
  };

  const signOut = async () => {
    try {
      const u = await auth.getUser().then(r => r?.data?.user).catch(() => null);
      // Clear user-specific profile data
      if (u?.id) {
        const profileKey = `profile_${u.id}`;
        await AsyncStorage.removeItem(profileKey);
      }
      await auth.signOut();
      // clear sensitive local state
      await AsyncStorage.removeItem('active_list');
      await AsyncStorage.removeItem('joined_lists');
      // Clear profile state
      setDisplayName('');
      setUsername('');
      setAvatarUri(null);
      setUserEmail(null);
    } catch (e) { console.warn('signOut', e); }
  };

  return (
    <Screen>
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarContainer} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{uri:avatarUri}} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayName ? displayName[0].toUpperCase() : userEmail ? userEmail[0].toUpperCase() : 'P'}
              </Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Text style={styles.avatarEditText}>📷</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <Text style={styles.profileTitle}>Profile</Text>
          <Text style={styles.profileEmail}>{userEmail || 'No email'}</Text>
        </View>
      </View>

      <View style={styles.profileForm}>
        <Text style={styles.label}>Display name</Text>
        <TextInput 
          value={displayName} 
          onChangeText={setDisplayName} 
          placeholder="Your name" 
          placeholderTextColor={theme.colors.muted}
          style={styles.input} 
        />
        <Text style={styles.label}>Username</Text>
        <TextInput 
          value={username} 
          onChangeText={setUsername} 
          placeholder="unique username" 
          placeholderTextColor={theme.colors.muted}
          style={styles.input} 
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            onPress={saveProfile} 
            style={[styles.cta, styles.saveBtn]}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>💾 Save</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={signOut} 
            style={[styles.cta, styles.signOutBtn]}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listsContainer}>
        <Text style={styles.sectionTitle}>📋 Your lists</Text>
        {joinedLists.length === 0 ? (
          <Text style={{color:'#666'}}>You haven't joined any lists yet.</Text>
        ) : (
          <FlatList
            data={joinedLists}
            keyExtractor={(i) => i.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
            }
            renderItem={({item}) => (
              <View style={styles.listItemCard}>
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>{item.name}</Text>
                  <Text style={styles.listItemCode}>{item.invite_code}</Text>
                </View>
                <View style={styles.listItemActions}>
                  <TouchableOpacity 
                    onPress={() => setActive(item)} 
                    style={styles.listActionBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.listActionText}>Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => copyInvite(item)} 
                    style={styles.listActionBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.listActionText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => deleteOrLeave(item)} 
                    style={[styles.listActionBtn, styles.deleteBtn]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
        {/* Demo cleanup action */}
        {(joinedLists.find(l => l.id === 'couple_demo') || activeList?.id === 'couple_demo') && (
          <TouchableOpacity onPress={deleteDemoData} style={[styles.cta, {backgroundColor:'#e74c3c', marginTop:12}]}> 
            <Text style={styles.ctaText}>Delete demo data</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accent,
  },
  avatarContainer: {
    marginRight: 16,
    position: 'relative',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  avatarInitial: {
    fontSize: 36,
    color: theme.colors.primaryDark,
    fontWeight: '800',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarEditText: {
    fontSize: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    marginBottom: 4,
  },
  profileEmail: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  profileForm: {
    marginBottom: 24,
  },
  label: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  cta: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
  },
  signOutBtn: {
    backgroundColor: '#e74c3c',
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  listsContainer: {
    marginTop: 8,
    flex: 1,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 12,
    color: theme.colors.text,
  },
  listItemCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 4,
  },
  listItemCode: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  listItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listActionBtn: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
  },
  listActionText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  deleteBtn: {
    backgroundColor: '#fff5f5',
  },
  deleteText: {
    color: '#e74c3c',
    fontWeight: '600',
    fontSize: 14,
  },
});
