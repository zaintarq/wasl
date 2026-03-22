import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, datePlanService, userService } from '../../services/firebaseService';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { dateSuggestionService } from '../../services/dateSuggestionService';

export function DatePlanningScreen({ onNavigate, matchId }) {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  
  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [activityType, setActivityType] = useState('');

  const meUid = authService.getCurrentUser()?.uid || null;

  useEffect(() => {
    if (!matchId) return;
    const loadPlans = async () => {
      try {
        const res = await datePlanService.getPlansForMatch(matchId);
        setPlans(res.data || []);
      } catch (e) {
        console.warn('[DatePlanning] Error loading plans:', e);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, [matchId]);

  const handleSuggest = async () => {
    if (!matchId || !meUid) return;
    setSuggesting(true);
    try {
      const suggestions = await dateSuggestionService.suggestPlans(matchId, meUid);
      if (suggestions.length > 0) {
        Alert.alert('Suggestions', `Found ${suggestions.length} date ideas!`, [
          { text: 'View', onPress: () => {
            // TODO: Show suggestions modal
            Alert.alert('Date Ideas', suggestions.map(s => s.title).join('\n'));
          }},
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        Alert.alert('No suggestions', 'Could not generate date ideas at this time.');
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to get suggestions.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleCreate = async () => {
    if (!matchId || !meUid || !title.trim()) {
      Alert.alert('Missing info', 'Please fill in at least a title.');
      return;
    }

    try {
      // Get other user from match
      const parts = String(matchId).split('_');
      const otherUid = parts.find((p) => p && p !== meUid) || null;
      if (!otherUid) {
        Alert.alert('Error', 'Could not find match participant.');
        return;
      }

      const { planId, error } = await datePlanService.createPlan(matchId, {
        createdBy: meUid,
        participants: [meUid, otherUid],
        title: title.trim(),
        description: description.trim(),
        date: date.trim() || null,
        time: time.trim(),
        location: { name: location.trim(), address: location.trim() },
        activityType: activityType.trim(),
        status: 'proposed',
      });

      if (error) {
        Alert.alert('Error', error);
        return;
      }

      Alert.alert('Created', 'Date plan created!');
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setLocation('');
      setActivityType('');
      
      // Reload plans
      const res = await datePlanService.getPlansForMatch(matchId);
      setPlans(res.data || []);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create plan.');
    }
  };

  const handleAccept = async (planId) => {
    if (!meUid) return;
    try {
      const { error } = await datePlanService.acceptPlan(planId, meUid);
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      Alert.alert('Accepted', 'Date plan accepted!');
      const res = await datePlanService.getPlansForMatch(matchId);
      setPlans(res.data || []);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to accept plan.');
    }
  };

  const handleDecline = async (planId) => {
    if (!meUid) return;
    try {
      const { error } = await datePlanService.declinePlan(planId, meUid);
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      Alert.alert('Declined', 'Date plan declined.');
      const res = await datePlanService.getPlansForMatch(matchId);
      setPlans(res.data || []);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to decline plan.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('chat', { matchId })}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Date Planning</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.actions}>
          <RetroButton
            variant="blue"
            title={suggesting ? 'Suggesting...' : '🤖 AI Suggest'}
            onPress={handleSuggest}
            disabled={suggesting}
          />
          <RetroButton
            variant="red"
            title={showCreate ? 'Cancel' : 'Create Plan'}
            onPress={() => setShowCreate(!showCreate)}
          />
        </View>

        {showCreate && (
          <View style={styles.createForm}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Dinner at Italian restaurant"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Let's try that new place downtown"
              multiline
            />

            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2024-12-25"
            />

            <Text style={styles.label}>Time</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="7:00 PM"
            />

            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Restaurant name or address"
            />

            <Text style={styles.label}>Activity Type</Text>
            <TextInput
              style={styles.input}
              value={activityType}
              onChangeText={setActivityType}
              placeholder="Dinner, Movie, Walk, etc."
            />

            <RetroButton variant="red" title="Create Plan" onPress={handleCreate} />
          </View>
        )}

        <View style={styles.plansList}>
          <Text style={styles.sectionTitle}>Date Plans</Text>
          {loading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : plans.length === 0 ? (
            <Text style={styles.emptyText}>No date plans yet. Create one!</Text>
          ) : (
            plans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                {plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
                {plan.date && <Text style={styles.planMeta}>📅 {plan.date}</Text>}
                {plan.time && <Text style={styles.planMeta}>🕐 {plan.time}</Text>}
                {plan.location?.name && <Text style={styles.planMeta}>📍 {plan.location.name}</Text>}
                <Text style={styles.planStatus}>Status: {plan.status}</Text>
                
                {plan.status === 'proposed' && plan.createdBy !== meUid && (
                  <View style={styles.planActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={() => handleAccept(plan.id)}
                    >
                      <Text style={styles.actionBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.declineBtn]}
                      onPress={() => handleDecline(plan.id)}
                    >
                      <Text style={styles.actionBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#8b4513',
    backgroundColor: '#fffef0',
  },
  backBtn: {
    fontSize: 14,
    fontWeight: '900',
    color: '#800020',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#8b4513',
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  createForm: {
    backgroundColor: '#fffef0',
    padding: 16,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#8b4513',
    marginBottom: 20,
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#8b4513',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  plansList: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  planCard: {
    backgroundColor: '#fffef0',
    padding: 16,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#8b4513',
    gap: 8,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#800020',
  },
  planDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  planMeta: {
    fontSize: 11,
    fontWeight: '800',
    color: '#654321',
  },
  planStatus: {
    fontSize: 11,
    fontWeight: '900',
    color: '#666',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  planActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 3,
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: '#90ee90',
    borderColor: '#228b22',
  },
  declineBtn: {
    backgroundColor: '#ff6b6b',
    borderColor: '#dc143c',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
});
