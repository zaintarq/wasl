import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, wingmanService } from '../../services/firebaseService';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

export function WingmanScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [mode, setMode] = useState('idle'); // idle|owner|member
  const [code, setCode] = useState('');
  const [room, setRoom] = useState(null);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    if (!code) return;
    const unsub = wingmanService.listenRoom(code, ({ data }) => setRoom(data || null));
    return () => unsub && unsub();
  }, [code]);

  const isOwner = useMemo(() => !!meUid && String(room?.ownerUid || '') === String(meUid), [room?.ownerUid, meUid]);
  const isMember = useMemo(() => !!meUid && String(room?.memberUid || '') === String(meUid), [room?.memberUid, meUid]);

  const create = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    const res = await wingmanService.createRoom(meUid);
    if (res.error) Alert.alert('Error', res.error);
    else {
      setMode('owner');
      setCode(res.code);
    }
  };

  const join = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    const c = String(joinCode || '').trim().toUpperCase();
    if (!c) return;
    const { error } = await wingmanService.joinRoom(c, meUid);
    if (error) Alert.alert('Error', error);
    else {
      setMode('member');
      setCode(c);
    }
  };

  const vote = async (v) => {
    if (!meUid || !code) return;
    const { error } = await wingmanService.setMemberVote(code, meUid, v);
    if (error) Alert.alert('Error', error);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('settings')} haptic="light">
          <Text style={styles.headerBtnText}>← Back</Text>
        </HuzzPressable>
        <Text style={styles.title}>Wingman</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {!code ? (
          <>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>What is this?</Text>
              <Text style={styles.boxText}>
                Create a room code, send it to your friend, and they can vote live on your current swipe card.
              </Text>
            </View>

            <HuzzPressable style={[styles.btn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]} onPress={create} haptic="medium">
              <Text style={styles.btnText}>Create room</Text>
            </HuzzPressable>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Join a room</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter code (e.g. ABC123)"
                value={joinCode}
                onChangeText={setJoinCode}
                autoCapitalize="characters"
              />
              <HuzzPressable style={[styles.btn, { backgroundColor: '#87ceeb' }]} onPress={join} haptic="light">
                <Text style={styles.btnText}>Join</Text>
              </HuzzPressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Room code</Text>
              <Text style={styles.code}>{code}</Text>
              <Text style={styles.boxText}>Share this code with your wingman.</Text>
            </View>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Live card</Text>
              {room?.currentCard ? (
                <>
                  <Text style={styles.boxText}>
                    {room.currentCard?.name || 'User'} {room.currentCard?.age ? `• ${room.currentCard.age}` : ''}
                  </Text>
                  <Text style={styles.boxText}>Ask your wingman to vote below.</Text>
                </>
              ) : (
                <Text style={styles.boxText}>Waiting for a card… (owner needs to start swiping)</Text>
              )}
            </View>

            {isMember ? (
              <View style={styles.voteRow}>
                <HuzzPressable style={[styles.voteBtn, { backgroundColor: '#ff6b6b' }]} onPress={() => vote('pass')} haptic="light">
                  <Text style={styles.voteText}>✕</Text>
                </HuzzPressable>
                <HuzzPressable style={[styles.voteBtn, { backgroundColor: '#87ceeb' }]} onPress={() => vote('super')} haptic="light">
                  <Text style={styles.voteText}>⭐</Text>
                </HuzzPressable>
                <HuzzPressable style={[styles.voteBtn, { backgroundColor: '#90ee90' }]} onPress={() => vote('like')} haptic="light">
                  <Text style={styles.voteText}>❤️</Text>
                </HuzzPressable>
              </View>
            ) : null}

            {(isOwner || isMember) ? (
              <View style={styles.box}>
                <Text style={styles.boxTitle}>Latest wingman vote</Text>
                <Text style={styles.boxText}>{room?.memberVote ? String(room.memberVote).toUpperCase() : 'No vote yet'}</Text>
              </View>
            ) : null}

            <HuzzPressable
              style={[styles.btn, { backgroundColor: '#c0c0c0' }]}
              onPress={() => {
                setCode('');
                setJoinCode('');
                setRoom(null);
                setMode('idle');
              }}
              haptic="light"
            >
              <Text style={styles.btnText}>Leave</Text>
            </HuzzPressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: '#8b4513',
    backgroundColor: '#ffffff',
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    width: 70,
    alignItems: 'center',
  },
  headerBtnText: { fontWeight: '900', color: '#000000' },
  title: { fontSize: 18, fontWeight: '900', color: '#8b4513', letterSpacing: 1 },
  box: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  boxTitle: { fontSize: 12, fontWeight: '900', color: '#800020', letterSpacing: 1 },
  boxText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  code: { fontSize: 28, fontWeight: '900', color: '#000000', letterSpacing: 4, textAlign: 'center' },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000000',
  },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#c0c0c0',
  },
  btnText: { textAlign: 'center', fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5 },
  voteRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 12, marginTop: 6 },
  voteBtn: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#654321',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteText: { fontSize: 30, fontWeight: '900', color: '#000000' },
});

