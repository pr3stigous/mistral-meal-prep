import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, Platform, Alert, TextInput, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { Database } from '../../lib/database.types';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';

type MealPrepEventRow = Database['public']['Tables']['meal_prep_events']['Row'];
type EventMapScreenNavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'EventMap'>;

// Define a default region (e.g., center of the US) for fallback
const DEFAULT_REGION = {
  latitude: 39.8283, // A central point in the USA
  longitude: -98.5795,
  latitudeDelta: 15, // Zoomed out to see a large area
  longitudeDelta: 15,
};

const EventMapScreen = () => {
  const navigation = useNavigation<EventMapScreenNavigationProp>();
  const [events, setEvents] = useState<MealPrepEventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingLocation, setLoadingLocation] = useState(true); // Separate loading for location
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // State for ZIP code search
  const [zipCodeInput, setZipCodeInput] = useState('');
  const [isGeocodingZip, setIsGeocodingZip] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingLocation(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is needed to show your current location on the map. You can enable it in settings.'
        );
        // If permission denied, we won't set userLocation, map will use DEFAULT_REGION or first event later
        setLoadingLocation(false);
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({});
        setUserLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.0922, // Standard zoom level
          longitudeDelta: 0.0421,
        });
      } catch (e) {
        console.warn('Error fetching current location:', e);
        Alert.alert('Location Error', 'Could not fetch your current location. Displaying default map area.');
        // Fallback to default region if location fetch fails
      } finally {
        setLoadingLocation(false);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchEventsWithCoordinates = async () => {
      setLoadingEvents(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('meal_prep_events')
          .select('*')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .in('status', ['planning', 'confirmed']);

        if (fetchError) {
          throw fetchError;
        }
        setEvents(data || []);
        // Adjust map region only if user location was not obtained and events exist
        if (!userLocation && data && data.length > 0) {
          const firstEventWithCoords = data.find(event => event.latitude && event.longitude);
          if (firstEventWithCoords) {
            setRegion(prevRegion => ({
              ...prevRegion, // Keep existing delta values if set by user location
              latitude: firstEventWithCoords.latitude!,
              longitude: firstEventWithCoords.longitude!,
              // If userLocation was never set, provide a default delta
              latitudeDelta: prevRegion.latitudeDelta === DEFAULT_REGION.latitudeDelta ? 0.0922 : prevRegion.latitudeDelta,
              longitudeDelta: prevRegion.longitudeDelta === DEFAULT_REGION.longitudeDelta ? 0.0421 : prevRegion.longitudeDelta,
            }));
          }
        } else if (!userLocation && (!data || data.length === 0)) {
          // If no user location and no events, ensure we are on DEFAULT_REGION
          setRegion(DEFAULT_REGION);
        }
      } catch (e) {
        const err = e as Error;
        console.error('Error fetching events for map:', err);
        setError('Failed to load events. Please try again.');
      } finally {
        setLoadingEvents(false);
      }
    };

    // Fetch events after location attempt (or concurrently if preferred, but this is simpler)
    if (!loadingLocation) { // Only fetch events once location attempt is done
        fetchEventsWithCoordinates();
    }
  }, [userLocation, loadingLocation]); // Rerun if userLocation changes or initial location loading completes

  const handleMarkerPress = (eventId: string) => {
    navigation.navigate('MealPrepEventDetail', { eventId });
  };

  const handleZipSearch = async () => {
    if (!zipCodeInput.trim()) {
      Alert.alert('Missing ZIP Code', 'Please enter a ZIP code to search.');
      return;
    }
    setIsGeocodingZip(true);
    setError(null); // Clear previous errors
    try {
      console.log(`Geocoding ZIP: ${zipCodeInput.trim()}, Country: USA`);
      const { data: geoData, error: geoError } = await supabase.functions.invoke(
        'geocode-address',
        {
          body: {
            zip: zipCodeInput.trim(),
            country: 'USA', // Assuming USA for now, can be made dynamic if needed
          }
        }
      );

      if (geoError) {
        throw geoError;
      }

      if (geoData && geoData.latitude && geoData.longitude) {
        setRegion({
          latitude: geoData.latitude,
          longitude: geoData.longitude,
          latitudeDelta: 0.1, // Zoom level appropriate for a ZIP code area
          longitudeDelta: 0.05,
        });
      } else {
        Alert.alert('Location Not Found', 'Could not find coordinates for the entered ZIP code.');
      }
    } catch (e) {
      const err = e as Error;
      console.error('Error geocoding ZIP code:', err);
      Alert.alert('Search Error', `Failed to search for ZIP code: ${err.message}`);
      setError('Failed to geocode ZIP code.'); // Optionally set a screen error
    } finally {
      setIsGeocodingZip(false);
    }
  };

  if (loadingEvents || loadingLocation) { // Show loading if either is in progress
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>{loadingLocation ? 'Getting your location...' : 'Loading events...'}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Note: showsUserLocation prop on MapView will use the device's location service to show the blue dot.
  // The `region` state we manage is for the map's viewport/camera position.

  return (
    <View style={styles.container}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        region={region} // Controlled region
        onRegionChangeComplete={setRegion} // Allow user to pan/zoom
        showsUserLocation={true}
        showsMyLocationButton={true} // Shows a button to re-center on user location
      >
        {events.map(event => (
          event.latitude && event.longitude && (
            <Marker
              key={event.id}
              coordinate={{ latitude: event.latitude, longitude: event.longitude }}
              title={event.title}
              description={event.location_city || 'Tap to see details'}
              onCalloutPress={() => handleMarkerPress(event.id)}
            />
          )
        ))}
      </MapView>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.zipInput}
          placeholder="Enter ZIP Code"
          value={zipCodeInput}
          onChangeText={setZipCodeInput}
          keyboardType="numeric"
          onSubmitEditing={handleZipSearch} // Allow search on keyboard submit
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleZipSearch} disabled={isGeocodingZip}>
          {isGeocodingZip ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {events.length === 0 && !error && !loadingEvents && (
        <View style={styles.noEventsMessageContainer}>
          <Text style={styles.noEventsText}>No events with locations found nearby or matching your criteria.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40, // Adjust based on status bar height
    left: 10,
    right: 10,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  zipInput: {
    flex: 1,
    height: 40,
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginRight: 8,
    backgroundColor: '#FFF',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  noEventsMessageContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
  },
  noEventsText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default EventMapScreen; 