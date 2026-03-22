import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, spinService, userService } from '../../services/firebaseService';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

export function SpinBottleScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null);
  const [meProfile, setMeProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!meUid) return;
      const res = await userService.getUserById(meUid);
      if (!cancelled) setMeProfile(res?.data || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [meUid]);

  useEffect(() => {
    if (!code) return;
    const unsub = spinService.listenRoom(code, ({ data }) => setRoom(data || null));
    return () => unsub && unsub();
  }, [code]);

  const isOwner = useMemo(() => !!meUid && String(room?.ownerUid || '') === String(meUid), [room?.ownerUid, meUid]);

  const create = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    const city = String(meProfile?.city || '').trim() || String(String(meProfile?.location || '').split(',')[0] || '').trim();
    const res = await spinService.createRoom(meUid, { city, maxSize: 6 });
    if (res.error) Alert.alert('Error', res.error);
    else setCode(res.code);
  };

  const join = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    const c = String(joinCode || '').trim().toUpperCase();
    if (!c) return;
    const { error } = await spinService.joinRoom(c, meUid);
    if (error) Alert.alert('Error', error);
    else setCode(c);
  };

  const spin = async () => {
    if (!meUid || !code) return;
    const { matchId, error } = await spinService.spin(code, meUid);
    if (error) Alert.alert('Error', error);
    else if (matchId) {
      Alert.alert('Paired!', 'You spun a pair for a 60s chat.');
      // If I’m in the pair, go directly to chat.
      const a = String(room?.currentPair?.a || '');
      const b = String(room?.currentPair?.b || '');
      if (a === meUid || b === meUid) onNavigate('chat', { matchId });
    }
  };

  const myInRoom = useMemo(() => {
    const list = Array.isArray(room?.participants) ? room.participants.map(String) : [];
    return !!meUid && list.includes(String(meUid));
  }, [room?.participants, meUid]);

  const count = Array.isArray(room?.participants) ? room.participants.length : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('settings')} haptic="light">
          <Text style={styles.headerBtnText}>← Back</Text>
        </HuzzPressable>
        <Text style={styles.title}>Spin Bottle</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {!code ? (
          <>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>How it works</Text>
              <Text style={styles.boxText}>
                Join 3–6 people in a room. The host spins a random pair and they get a 60 second chat. If both tap
                Continue, it unlocks.
              </Text>
            </View>
            <HuzzPressable style={[styles.btn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]} onPress={create} haptic="medium">
              <Text style={styles.btnText}>Create room</Text>
            </HuzzPressable>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Join room</Text>
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
              <Text style={styles.boxText}>People: {count}/6</Text>
              {room?.city ? <Text style={styles.boxText}>City: {room.city}</Text> : null}
            </View>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Status</Text>
              <Text style={styles.boxText}>
                {isOwner ? 'You are host.' : myInRoom ? 'You joined this room.' : 'Not in room.'}
              </Text>
            </View>

            {isOwner ? (
              <HuzzPressable
                style={[styles.btn, { backgroundColor: '#ffb347' }]}
                onPress={spin}
                haptic="medium"
                disabled={count < 3}
              >
                <Text style={styles.btnText}>{count < 3 ? 'Need 3+ people' : 'SPIN 🎲'}</Text>
              </HuzzPressable>
            ) : null}

            {room?.currentPair?.matchId ? (
              <View style={styles.box}>
                <Text style={styles.boxTitle}>Current pair</Text>
                <Text style={styles.boxText}>
                  {String(room.currentPair.a || '').slice(0, 6)} + {String(room.currentPair.b || '').slice(0, 6)}
                </Text>
                <HuzzPressable
                  style={[styles.btn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
                  onPress={() => onNavigate('chat', { matchId: room.currentPair.matchId })}
                  haptic="light"
                >
                  <Text style={styles.btnText}>Open chat</Text>
                </HuzzPressable>
              </View>
            ) : null}

            <HuzzPressable
              style={[styles.btn, { backgroundColor: '#c0c0c0' }]}
              onPress={() => {
                setCode('');
                setJoinCode('');
                setRoom(null);
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
});

