import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { ApiError, request, type User, type Entry, type Grant, type AccessRequest, type Audit } from './src/api';

import { createEmergencySnapshot, parseEmergencySnapshot, eligibleEmergencyEntry, type EmergencySnapshot } from './src/emergency-policy';

type Page = 'Overview' | 'Timeline' | 'Medicines' | 'Sharing' | 'History' | 'Settings';
const pages: Page[] = ['Overview', 'Timeline', 'Medicines', 'Sharing', 'History', 'Settings'];
const formatDate = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); };

export default function App() {
  const system = useColorScheme();
  const [dark, setDark] = useState(system === 'dark');
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>('login');
  const [displayName, setDisplayName] = useState('');
  const [otp, setOtp] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [page, setPage] = useState<Page>('Overview');
  const [records, setRecords] = useState<Entry[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [history, setHistory] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [biometric, setBiometric] = useState(false);
  const [locked, setLocked] = useState(false);
  const [background, setBackground] = useState(false);
  const [loaded, setLoaded] = useState('');
  const [filter, setFilter] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [cacheSelection, setCacheSelection] = useState<string[]>([]);
  const [hasEmergencyCache, setHasEmergencyCache] = useState(false);
  const [offlineSnapshot, setOfflineSnapshot] = useState<EmergencySnapshot | null>(null);
  const [shareRequest, setShareRequest] = useState<AccessRequest | null>(null);
  const [scopes, setScopes] = useState<string[]>(['allergy', 'condition', 'medication']);
  const [duration, setDuration] = useState('24');
  const sessionGeneration = useRef(0);
  const biometricPrompt = useRef(false);
  const colors = dark ? { bg: '#111c20', card: '#1b2b30', ink: '#f0f5f2', muted: '#b0c5c4', line: '#3a5054', accent: '#7fd4bf', button: '#276b5f' } : { bg: '#f4f6f2', card: '#ffffff', ink: '#153d39', muted: '#58706b', line: '#dce5df', accent: '#236958', button: '#236958' };
  const clearData = () => { setRecords([]); setGrants([]); setRequests([]); setHistory([]); setLoaded(''); setEmergency(false); setShareRequest(null); setOfflineSnapshot(null); setCacheSelection([]); };
  const leaveSession = () => { sessionGeneration.current++; setUser(null); setLocked(false); clearData(); setPassword(''); setOtp(''); setRecoveryCode(''); };
  const clearEmergencyCache = async () => {
    setOfflineSnapshot(null); setHasEmergencyCache(false); setCacheSelection([]);
    await SecureStore.deleteItemAsync('emergency-summary-available');
    await SecureStore.deleteItemAsync('emergency-summary-v1');
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { if (e instanceof ApiError && [401, 403].includes(e.status)) { await clearEmergencyCache().catch(() => undefined); if (e.status === 401) leaveSession(); } setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };
  const load = useCallback(async (patient: User) => {
    const generation = sessionGeneration.current;
    const [r, g, q, h] = await Promise.all([
      request<Entry[]>(`/patients/${patient.id}/timeline`), request<Grant[]>('/consents'),
      request<AccessRequest[]>('/access-requests'), request<Audit[]>('/audit'),
    ]);
    if (generation !== sessionGeneration.current) return;
    setRecords(r); setGrants(g); setRequests(q); setHistory(h); setLoaded(new Date().toISOString());
  }, []);
  useEffect(() => {
    if (!offlineSnapshot) return;
    const timer = setTimeout(() => { void clearEmergencyCache().catch(() => undefined); setError('The saved emergency summary has expired. Connect to save a new one.'); }, Math.max(0, Date.parse(offlineSnapshot.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [offlineSnapshot]);
  useEffect(() => { SecureStore.getItemAsync('emergency-summary-available').then(v => setHasEmergencyCache(v === 'true')).catch(() => undefined); }, []);
  useEffect(() => { SecureStore.getItemAsync('biometric-lock').then(v => setBiometric(v === 'true')).catch(() => setBiometric(false)); }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setBackground(state !== 'active');
      if (state === 'background') { setOfflineSnapshot(null); setPassword(''); setOtp(''); setRecoveryCode(''); }
      if (state === 'background' && user && !biometricPrompt.current) {
        sessionGeneration.current++;
        clearData();
        if (biometric) setLocked(true);
        else { setUser(null); void clearEmergencyCache().catch(() => undefined); void request('/auth/logout', 'POST').catch(() => undefined); }
      }
    });
    return () => listener.remove();
  }, [user, biometric]);
  const login = () => run(async () => {
    if (authMode === 'register') {
      const result = await request<{ healthId: string }>('/auth/register', 'POST', { username: username.trim(), displayName: displayName.trim(), password });
      setAuthMode('login'); setPassword(''); setMessage(`Patient account created. Your permanent Health ID is ${result.healthId}. Sign in to continue.`); return;
    }
    if (authMode === 'recover') {
      await request('/auth/recover', 'POST', { username: username.trim(), recoveryCode: recoveryCode.trim(), newPassword: password });
      await clearEmergencyCache();
      setAuthMode('login'); setPassword(''); setRecoveryCode(''); setOtp(''); setMessage('Password reset and previous sessions revoked. Sign in, then enroll a new second factor on the Security page in the web portal.'); return;
    }
    const result = await request<User>('/auth/login', 'POST', { username: username.trim(), password, otp: otp.trim() });
    setPassword(''); setOtp('');
    if (result.role !== 'patient') { await request('/auth/logout', 'POST'); throw new Error('Use a patient account in the mobile app. Staff access is available in the web portal.'); }
    await clearEmergencyCache();
    setUser(result); setPage('Overview'); setLocked(false); await load(result);
  });
  const unlock = () => run(async () => {
    biometricPrompt.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Health Passport', disableDeviceFallback: true, biometricsSecurityLevel: 'strong' });
      if (!result.success) throw new Error('Your passport remains locked. Try again or sign out.');
      if (user) { await load(user); setLocked(false); }
    } finally { biometricPrompt.current = false; }
  });
  const toggleBiometric = (enabled: boolean) => run(async () => {
    if (!enabled) await clearEmergencyCache();
    if (enabled) {
      const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (!hardware || !enrolled) throw new Error('Set up fingerprint or face authentication in device settings first.');
      biometricPrompt.current = true;
      try { const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable passport unlock', disableDeviceFallback: true, biometricsSecurityLevel: 'strong' }); if (!result.success) throw new Error('Biometric unlock was not enabled.'); }
      finally { biometricPrompt.current = false; }
    }
    await SecureStore.setItemAsync('biometric-lock', String(enabled), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    setBiometric(enabled);
  });
  const logout = () => run(async () => { try { await request('/auth/logout', 'POST'); } finally { try { await clearEmergencyCache(); } finally { leaveSession(); } } });
  const saveEmergencyCache = () => run(async () => {
    if (!user) throw new Error('Sign in to save an emergency summary.');
    const current = await request<User>('/me');
    if (current.id !== user.id) throw new Error('Account changed. Sign out and sign in again.');
    await load(user);
    const latest = await request<Entry[]>(`/patients/${user.id}/timeline`);
    const selected = latest.filter(r => cacheSelection.includes(r.id));
    if (selected.length !== cacheSelection.length) throw new Error('Some selected records are no longer available. Refresh and select again.');
    const snapshot = createEmergencySnapshot(user.id, selected);
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) throw new Error('Enroll device biometrics before saving protected emergency information.');
    biometricPrompt.current = true;
    try {
      await SecureStore.setItemAsync('emergency-summary-v1', JSON.stringify(snapshot), { requireAuthentication: true, authenticationPrompt: 'Protect emergency summary', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      await SecureStore.setItemAsync('emergency-summary-available', 'true');
      await SecureStore.setItemAsync('biometric-lock', 'true', { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      setBiometric(true); setHasEmergencyCache(true); setMessage('Selected emergency records saved for up to 24 hours. Biometric locking is enabled.');
    } catch (e) { await clearEmergencyCache().catch(() => undefined); throw e; }
    finally { biometricPrompt.current = false; }
  });
  const openEmergencyCache = () => run(async () => {
    let onlineUser: User | null = null;
    try { onlineUser = await request<User>('/me'); }
    catch (e) {
      if (!(e instanceof TypeError) && !(e instanceof Error && e.name === 'AbortError')) throw e;
      // Only an unavailable network permits offline use. Authorization failures never fall back.
    }
    biometricPrompt.current = true;
    try {
      const raw = await SecureStore.getItemAsync('emergency-summary-v1', { requireAuthentication: true, authenticationPrompt: 'Unlock saved emergency summary' });
      if (!raw) { await clearEmergencyCache(); throw new Error('No saved emergency summary is available. It may have been removed after biometric settings changed.'); }
      const snapshot = parseEmergencySnapshot(raw);
      if ((onlineUser && onlineUser.id !== snapshot.patientId) || (user && user.id !== snapshot.patientId)) { await clearEmergencyCache(); throw new Error('This saved summary belongs to another account and has been removed.'); }
      setOfflineSnapshot(snapshot);
    } catch (e) {
      if (e instanceof Error && /expired|invalid/.test(e.message)) await clearEmergencyCache().catch(() => undefined);
      throw e;
    } finally { biometricPrompt.current = false; }
  });
  const button = (label: string, action: () => void, secondary = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={({ pressed }) => [s.button, { backgroundColor: secondary ? colors.card : colors.button, borderColor: colors.line, opacity: busy || pressed ? 0.6 : 1 }]}><Text style={[s.buttonText, { color: secondary ? colors.ink : '#fff' }]}>{label}</Text></Pressable>;
  const copy = (text: string, muted = false) => <Text style={[s.copy, { color: muted ? colors.muted : colors.ink }]}>{text}</Text>;
  const card = (title: string, children: React.ReactNode, key?: string) => <View key={key || title} style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}><Text accessibilityRole="header" style={[s.cardTitle, { color: colors.ink }]}>{title}</Text>{children}</View>;
  const entry = (record: Entry) => card(record.title, <>{copy(`${record.kind.toLowerCase().replaceAll('_', ' ')} · record ${record.status}`, true)}{copy(record.details)}{copy(`${record.source} · ${formatDate(record.createdAt)}`, true)}{record.clinicalStatus && copy(`Clinical status: ${record.clinicalStatus}`, true)}{record.authorName && copy(`Recorded by ${record.authorName}`, true)}</>, record.id);
  const medicines = records.filter(r => ['medication', 'prescription'].includes(r.kind));
  const showRecords = records.filter(r => `${r.title} ${r.kind} ${r.details}`.toLowerCase().includes(filter.toLowerCase()));

  return <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <View style={[s.brand, { borderColor: colors.line }]}><View style={s.logo}><Text style={s.plus}>+</Text></View><View><Text style={[s.brandName, { color: colors.ink }]}>Health Passport</Text><Text style={[s.caption, { color: colors.muted }]}>Your health, connected.</Text></View></View>
    {background ? <View style={s.center}>{copy('Health Passport is protected.')}</View> : <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={user && !locked ? <RefreshControl refreshing={busy} onRefresh={() => void run(() => load(user))} tintColor={colors.accent} /> : undefined}>
      <Text style={[s.pilot, { color: colors.accent }]}>SYNTHETIC PILOT · NO REAL PATIENT DATA</Text>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={[s.copy, { color: colors.accent }]}>{message}</Text> : null}
      {busy && <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />}
      {offlineSnapshot ? <>
        <Text accessibilityRole="header" style={[s.title, { color: colors.ink }]}>Saved emergency summary</Text>
        {copy('SAVED SNAPSHOT · MAY BE STALE OR INCOMPLETE', true)}
        {copy(`Saved ${formatDate(offlineSnapshot.generatedAt)} · expires ${formatDate(offlineSnapshot.expiresAt)}`)}
        {copy('Only your selected records are shown. Changes and revocations made after saving may be unavailable while offline. This is not a live medical record.', true)}
        {offlineSnapshot.entries.map(entry)}
        {button('Close summary', () => setOfflineSnapshot(null), true)}
        {button('Remove saved summary', () => void run(clearEmergencyCache), true)}
      </> : !user ? <>
        <Text accessibilityRole="header" style={[s.title, { color: colors.ink }]}>A clearer picture of your health.</Text>
        {copy('Keep your records together. Choose who can see them.', true)}
        {card(authMode === 'login' ? 'Welcome back' : authMode === 'register' ? 'Create a patient account' : 'Recover your account', <>
          {authMode === 'register' && <><Text style={[s.label, { color: colors.ink }]}>Your name</Text><TextInput accessibilityLabel="Your name" value={displayName} onChangeText={setDisplayName} textContentType="name" style={[s.input, { color: colors.ink, borderColor: colors.line }]} />{copy('Synthetic pilot only. Use a fictional name and no real patient information.', true)}</>}
          {authMode === 'recover' && <><Text style={[s.label, { color: colors.ink }]}>Recovery code</Text><TextInput accessibilityLabel="Recovery code" value={recoveryCode} onChangeText={setRecoveryCode} autoCapitalize="none" autoCorrect={false} secureTextEntry style={[s.input, { color: colors.ink, borderColor: colors.line }]} />{copy('Use one of the single-use recovery codes saved when you enabled two-factor authentication. All existing sessions will be revoked.', true)}</>}
          <Text style={[s.label, { color: colors.ink }]}>Username</Text><TextInput accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" style={[s.input, { color: colors.ink, borderColor: colors.line }]} />
          <Text style={[s.label, { color: colors.ink }]}>{authMode === 'recover' ? 'New password' : 'Password'}</Text><TextInput accessibilityLabel={authMode === 'recover' ? 'New password' : 'Password'} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoCapitalize="none" style={[s.input, { color: colors.ink, borderColor: colors.line }]} onSubmitEditing={login} />
          {authMode === 'login' && <><Text style={[s.label, { color: colors.ink }]}>Authenticator code (if enabled)</Text><TextInput accessibilityLabel="Authenticator code" value={otp} onChangeText={setOtp} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} style={[s.input, { color: colors.ink, borderColor: colors.line }]} /></>}
          {button(authMode === 'login' ? 'Sign in' : authMode === 'register' ? 'Create account' : 'Reset password', login)}
          {authMode !== 'login' && copy('Use a unique passphrase of at least 12 characters.', true)}
          {button(authMode === 'register' ? 'Back to sign in' : 'Create patient account', () => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setPassword(''); setOtp(''); setRecoveryCode(''); setError(''); }, true)}
          {button(authMode === 'recover' ? 'Back to sign in' : 'Use a recovery code', () => { setAuthMode(authMode === 'recover' ? 'login' : 'recover'); setPassword(''); setOtp(''); setRecoveryCode(''); setError(''); }, true)}
          {copy('Use the synthetic patient credentials from the project README. Your password is never saved on this device.', true)}
        </>)}
        {hasEmergencyCache && button('Open saved emergency summary', openEmergencyCache, true)}
      </> : locked ? <>{card('Your passport is locked', <>{copy('Unlock to retrieve fresh records from the server.')}{button('Unlock with biometrics', unlock)}{hasEmergencyCache && button('Open saved emergency summary', openEmergencyCache, true)}{button('Sign out', logout, true)}</>)}</> : <>
        <Text accessibilityRole="header" style={[s.title, { color: colors.ink }]}>{page === 'Overview' ? `Hello, ${user.displayName.split(' ')[0]}.` : page}</Text>
        <View style={s.tabs}>{pages.map(p => <Pressable key={p} accessibilityRole="tab" accessibilityState={{ selected: page === p }} onPress={() => { setPage(p); setEmergency(false); }} style={[s.tab, { backgroundColor: page === p ? colors.button : colors.card, borderColor: colors.line }]}><Text style={{ color: page === p ? '#fff' : colors.ink, fontWeight: '600' }}>{p}</Text></Pressable>)}</View>
        {page === 'Overview' && <>
          <View style={s.passport}><Text style={s.passportLabel}>PERSONAL HEALTH PASSPORT</Text><Text style={s.passportName}>{user.displayName}</Text><Text selectable style={s.healthId}>{user.healthId}</Text><Text style={s.passportNote}>A permanent identifier. Sharing your ID does not grant access.</Text></View>
          {card('At a glance', <>{copy(`${records.length} records · ${medicines.length} medication entries`)}{copy(`Last refreshed ${loaded ? formatDate(loaded) : '—'}`, true)}{button('View your timeline', () => setPage('Timeline'), true)}</>)}
          {card('Emergency information', <>{copy('Show allergies, conditions, and medications currently available in your passport. This summary may be incomplete.', true)}{button(emergency ? 'Hide summary' : 'Show emergency summary', () => setEmergency(!emergency), true)}{emergency && <>{copy('Live view. A saved copy exists only if you explicitly selected and saved records in Settings.', true)}{records.filter(r => r.status === 'active' && ['allergy', 'condition', 'medication', 'prescription'].includes(r.kind)).map(entry)}</>}</>)}
        </>}
        {page === 'Timeline' && <>
          <TextInput accessibilityLabel="Search your records" placeholder="Search records…" placeholderTextColor={colors.muted} value={filter} onChangeText={setFilter} style={[s.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          {copy('Records retain their source and status. The timeline may not contain your complete medical history.', true)}
          {showRecords.length ? showRecords.map(entry) : card('No matching records', copy('Try another search or pull down to refresh.'))}
        </>}
        {page === 'Medicines' && <>{copy('Medication and prescription history from your participating care team. This is not a prescription or advice to change treatment.', true)}{medicines.length ? medicines.map(entry) : card('No medication records', copy('Medication entries will appear here when recorded.'))}</>}
        {page === 'Sharing' && <>
          {copy('Choose categories and a time limit. Revocation prevents future access under a grant; it cannot retrieve previously disclosed records.', true)}
          {requests.filter(r => r.status === 'pending').map(r => card(r.requesterName || 'Care team access request', <>{copy(`Purpose: ${r.purpose}`)}{button('Review request', () => setShareRequest(r), true)}</>, r.id))}
          {shareRequest && card('Approve access', <>
            {copy(`Recipient: ${shareRequest.requesterName || shareRequest.requesterId}`)}
            {['allergy', 'condition', 'medication', 'prescription', 'encounter', 'lab_result', 'note', 'document'].map(scope => <View key={scope} style={s.row}><Text style={[s.copy, { color: colors.ink, flex: 1 }]}>{scope.toLowerCase().replaceAll('_', ' ')}</Text><Switch accessibilityLabel={`Share ${scope.toLowerCase()}`} value={scopes.includes(scope)} onValueChange={v => setScopes(v ? [...scopes, scope] : scopes.filter(s => s !== scope))} /></View>)}
            <Text style={[s.label, { color: colors.ink }]}>Duration in hours (1–720)</Text><TextInput accessibilityLabel="Access duration in hours" value={duration} onChangeText={setDuration} keyboardType="number-pad" style={[s.input, { color: colors.ink, borderColor: colors.line }]} />
            {button('Approve selected access', () => void run(async () => {
              const hours = Number(duration); if (!Number.isInteger(hours) || hours < 1 || hours > 720 || !scopes.length) throw new Error('Choose at least one category and a duration from 1 to 720 hours.');
              await request('/consents', 'POST', { patientId: user.id, granteeId: shareRequest.requesterId, scopes, purpose: shareRequest.purpose, expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), requestId: shareRequest.id });
              setShareRequest(null); await load(user); setMessage('Access approved.');
            }))}{button('Cancel', () => setShareRequest(null), true)}
          </>)}
          {grants.length ? grants.map(g => card(g.granteeName || 'Care team access', <>{copy(`${g.status === 'active' && new Date(g.expiresAt).getTime() <= Date.now() ? 'expired' : g.status} · ${g.purpose}`)}{copy(`Categories: ${g.scopes}`)}{copy(`Expires ${formatDate(g.expiresAt)}`, true)}{g.status === 'active' && button('Revoke access', () => Alert.alert('Revoke access?', 'Future access under this grant will stop. Previously disclosed records cannot be recalled.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Revoke', style: 'destructive', onPress: () => void run(async () => { await request(`/consents/${g.id}/revoke`, 'POST'); await load(user); setMessage('Access revoked.'); }) }]), true)}</>, g.id)) : card('No access grants', copy('Your participating care team can request permission to view your records.'))}
        </>}
        {page === 'History' && <>{copy('Access and changes recorded by the server. Pull down to refresh.', true)}{history.length ? history.map(h => card(h.action.toLowerCase().replaceAll('_', ' '), <>{copy(h.actorName || h.actorId || 'System')}{copy(formatDate(h.occurredAt), true)}{copy(`Reference: ${h.resourceId}`, true)}</>, h.id)) : card('No events yet', copy('Recorded activity will appear here.'))}</>}
        {page === 'Settings' && <>
          {card('Your preferences', <><View style={s.row}>{copy('Dark appearance')}<Switch accessibilityLabel="Dark appearance" value={dark} onValueChange={setDark} /></View><View style={s.row}>{copy('Biometric unlock')}<Switch accessibilityLabel="Biometric unlock" value={biometric} disabled={busy} onValueChange={toggleBiometric} /></View>{copy('Disabling biometric unlock removes saved emergency records. With biometric unlock enabled, leaving the app locks your passport. Otherwise, leaving the app signs you out. Clinical data is removed from the screen state in either case.', true)}</>)}
          {card('Optional offline emergency summary', <>
            {copy('Select up to five allergy or medication records. Save only what you want available offline for 24 hours. Device biometrics are required. The size limit may require fewer records; clinical text is never shortened.', true)}
            {records.filter(eligibleEmergencyEntry).map(r => <View key={r.id} style={s.row}><Text style={[s.copy, { color: colors.ink, flex: 1 }]}>{r.title}</Text><Switch accessibilityLabel={`Save ${r.title} offline`} value={cacheSelection.includes(r.id)} onValueChange={v => setCacheSelection(v ? [...cacheSelection, r.id] : cacheSelection.filter(id => id !== r.id))} /></View>)}
            {button('Save selected records for 24 hours', saveEmergencyCache)}
            {hasEmergencyCache && <>{button('Open saved emergency summary', openEmergencyCache, true)}{button('Remove saved summary', () => void run(clearEmergencyCache), true)}</>}
            {copy('Saving enables biometric app locking. Logging out, recovering the account, signing in again, or an authorization rejection removes the saved summary. Remote revocation cannot instantly remove an offline copy.', true)}
          </>)}
          {card('Privacy on this device', <>{copy('Records are held in memory unless you explicitly save selected emergency records above. The app never saves a whole-record cache or your password. Saved emergency records expire after 24 hours and require device biometrics.', true)}{copy('Biometrics unlock this app; server authorization still controls access.', true)}{button('Refresh records', () => void run(() => load(user)), true)}{button('Sign out', logout, true)}</>)}
        </>}
      </>}
      <Text style={[s.footer, { color: colors.muted }]}>Health Passport · Development pilot</Text>
    </ScrollView>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1 }, logo: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#236958', alignItems: 'center', justifyContent: 'center' }, plus: { color: '#fff', fontSize: 30, lineHeight: 34 }, brandName: { fontSize: 19, fontWeight: '700' }, caption: { fontSize: 12, marginTop: 3 }, content: { padding: 20, paddingBottom: 50, gap: 16 }, title: { fontSize: 32, lineHeight: 39, fontWeight: '600', letterSpacing: -0.7 }, pilot: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' }, copy: { fontSize: 15, lineHeight: 23, marginVertical: 3 }, card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 }, cardTitle: { fontSize: 19, fontWeight: '600', marginBottom: 4 }, label: { fontSize: 14, fontWeight: '600', marginTop: 6 }, input: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 16, minHeight: 48 }, button: { padding: 14, borderRadius: 11, borderWidth: 1, alignItems: 'center', marginTop: 6, minHeight: 48 }, buttonText: { fontSize: 15, fontWeight: '700' }, error: { color: '#b7402d', backgroundColor: '#fff0e9', padding: 14, borderRadius: 10, fontSize: 15 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tab: { paddingHorizontal: 15, paddingVertical: 14, borderWidth: 1, borderRadius: 25, minHeight: 44 }, passport: { backgroundColor: '#174f45', borderRadius: 20, padding: 25, gap: 14 }, passportLabel: { color: '#bde5d6', fontSize: 10, fontWeight: '700', letterSpacing: 1.7 }, passportName: { color: '#fff', fontSize: 26, fontWeight: '600' }, healthId: { color: '#fff', fontSize: 15, fontWeight: '500', letterSpacing: 1 }, passportNote: { color: '#c1dacf', fontSize: 12, lineHeight: 19 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 48 }, footer: { textAlign: 'center', fontSize: 12, marginTop: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
