// src/screens/AddItemScreen.js
import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet, Text, Switch, Alert, TouchableOpacity, Image, ScrollView } from "react-native";
import theme from '../theme';
import Screen from '../components/Screen';
import { db, storage } from "../../supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from "expo-image-picker";

const categories = ["Travel", "Food", "Adventure", "Goals", "Cute"];

export default function AddItemScreen({ navigation }) {
  const [title,setTitle] = useState("");
  const [desc,setDesc] = useState("");
  const [category,setCategory] = useState("Travel");
  const [secret,setSecret] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ 
      quality: 0.7, 
      allowsEditing: false,
      allowsMultipleSelection: true
    });
    if (result.cancelled) return;

    const photos = result.assets || (result.uri ? [result] : []);
    setSelectedPhotos([...selectedPhotos, ...photos]);
  };

  const removePhoto = (index) => {
    setSelectedPhotos(selectedPhotos.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert("Enter a title");
      return;
    }
    let sharedId = null;
    try {
      const stored = await AsyncStorage.getItem('active_list');
      if (stored) sharedId = JSON.parse(stored).id || null;
    } catch (e) {}

    if (!sharedId) {
      Alert.alert('No active list', 'Please create or join a list in Profile before adding items.');
      return;
    }

    try {
      // First create the item
      const { data: newItem, error: insertError } = await db.from('items').insert([{
        list_id: sharedId,
        title: title.trim(),
        description: desc.trim() || "",
        category,
        secret,
        completed: false,
        created_at: new Date().toISOString()
      }]).select().single();

      if (insertError) throw insertError;

      // Upload photos if any were selected
      if (selectedPhotos.length > 0) {
        const uploadedFilenames = [];
        for (let i = 0; i < selectedPhotos.length; i++) {
          const photo = selectedPhotos[i];
          try {
            const uri = photo.uri;
            // Create unique filename for each photo (without item ID prefix since we use nested path)
            const filename = `${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.jpg`;
            // Use nested path structure: listId/itemId/filename
            const path = `${sharedId}/${newItem.id}/${filename}`;
            
            // Read file as array buffer for React Native
            const response = await fetch(uri);
            if (!response.ok) {
              console.warn('Failed to fetch photo:', uri, response.status);
              continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const fileData = new Uint8Array(arrayBuffer);

            const { data: uploadData, error: uploadError } = await storage.bucket('memories').upload(path, fileData, { 
              contentType: 'image/jpeg',
              upsert: false 
            });
            
            if (uploadError) {
              console.warn('Upload error for photo', filename, uploadError);
            } else {
              console.log('Successfully uploaded photo:', filename, 'to path:', path, uploadData);
              uploadedFilenames.push(filename);
            }
          } catch (photoError) {
            console.warn('Error processing photo', photoError);
          }
        }

        // Update item with photo filenames
        if (uploadedFilenames.length > 0) {
          const { data: updatedItem, error: updateError } = await db.from('items').update({
            photos: uploadedFilenames
          }).eq('id', newItem.id).select().single();
          
          if (updateError) {
            console.warn('Error updating item with photos:', updateError);
            Alert.alert('Warning', `Item created but some photos may not have been saved. ${updateError.message}`);
          } else {
            console.log('Successfully updated item with photos:', uploadedFilenames.length, 'photos');
          }
        } else if (selectedPhotos.length > 0) {
          Alert.alert('Warning', 'Item created but photos failed to upload. Please try uploading photos again from the item detail screen.');
        }
      }

      navigation.goBack();
    } catch (e) {
      console.warn('Submit error', e);
      Alert.alert('Error', e.message || String(e));
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>✨ Add New Wish</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>Title</Text>
          <TextInput 
            style={styles.input} 
            value={title} 
            onChangeText={setTitle} 
            placeholder="e.g., Trip to Ooty" 
            placeholderTextColor={theme.colors.muted}
          />
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>Description</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            multiline 
            value={desc} 
            onChangeText={setDesc}
            placeholder="Add more details about your wish..."
            placeholderTextColor={theme.colors.muted}
          />
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chipContainer}>
            {categories.map(c => (
              <TouchableOpacity 
                key={c} 
                onPress={() => setCategory(c)} 
                style={[styles.chip, category===c && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, category===c && styles.chipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.secretSection}>
          <Text style={styles.secretLabel}>🔒 Secret wish (only visible to owner)</Text>
          <Switch 
            value={secret} 
            onValueChange={setSecret}
            trackColor={{ false: '#ddd', true: theme.colors.accent }}
            thumbColor={secret ? theme.colors.primary : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.formSection}>
          <Text style={styles.label}>📸 Photos (optional)</Text>
          <TouchableOpacity onPress={pickPhotos} style={styles.photoBtn} activeOpacity={0.8}>
            <Text style={styles.photoBtnText}>+ Add Photos</Text>
          </TouchableOpacity>
          
          {selectedPhotos.length > 0 && (
            <View style={styles.photosPreview}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {selectedPhotos.map((photo, idx) => (
                  <View key={idx} style={styles.photoPreview}>
                    <Image source={{uri: photo.uri}} style={styles.photoImg} />
                    <TouchableOpacity 
                      onPress={() => removePhoto(idx)} 
                      style={styles.removeBtn}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
        
        <TouchableOpacity onPress={submit} style={styles.cta} activeOpacity={0.8}>
          <Text style={styles.ctaText}>✨ Add Wish</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accent,
  },
  headerTitle: {
    fontWeight: '800',
    fontSize: 28,
    color: theme.colors.primaryDark,
    letterSpacing: -0.5,
  },
  formSection: {
    marginBottom: 20,
  },
  label: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginRight: 10,
    marginBottom: 10,
    borderRadius: 20,
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
  },
  chipText: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextActive: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  secretSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  secretLabel: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 15,
    flex: 1,
  },
  photoBtn: {
    backgroundColor: theme.colors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photoBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  photosPreview: {
    marginTop: 16,
  },
  photoPreview: {
    width: 110,
    height: 110,
    marginRight: 12,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  photoImg: {
    width: 110,
    height: 110,
    borderRadius: 12,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  removeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  cta: {
    backgroundColor: theme.colors.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
});
