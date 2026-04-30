import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Image,
  PermissionsAndroid,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, Info, AlertTriangle, X, ChevronRight } from 'lucide-react-native';
import Animated, {
  FadeInUp,
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import { GOOGLE_MAPS_API_KEY } from '../api/config';
import CustomAlert from '../components/CustomAlert';
import { db, auth } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
// No longer need width/height if not used
Dimensions.get('window');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

const formatTime = (date: any): string => {
  if (!date) return '--:--';
  const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDuration = (minutes: number): string => {
  const absMin = Math.max(0, minutes);
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

const minutesBetween = (from: any, to: Date): number => {
  if (!from) return 0;
  const start = (from instanceof Date ? from : (from?.toDate ? from.toDate() : new Date(from))).getTime();
  const end = to.getTime();
  const diff = Math.floor((end - start) / 60000);
  return Math.max(0, diff);
};

// ─── Component ──────────────────────────────────────────────────────────────

const HomeScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const staff = route?.params?.staff;

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [shiftMinutes, setShiftMinutes] = useState(0);
  const [yesterdayLog, setYesterdayLog] = useState<any[]>([]);
  const [currentLocation, setCurrentLocation] = useState('Detecting location...');
  const [greeting, setGreeting] = useState(getGreeting());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [clockLoading, setClockLoading] = useState(false);
  const [staffData, setStaffData] = useState(staff);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeBanner, setActiveBanner] = useState<any>(null);
  const bannerY = useSharedValue(-150);


  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info' | 'confirm',
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = setInterval(() => {
      setGreeting(getGreeting());
      setCurrentDate(new Date());
    }, 60000);
    return () => clearInterval(tick);
  }, []);

  const startTimer = useCallback((clockInTime: any, previousMinutes: number = 0) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const updateTime = () => {
      setShiftMinutes(previousMinutes + minutesBetween(clockInTime, new Date()));
    };
    updateTime();
    timerRef.current = setInterval(updateTime, 60000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShiftMinutes(0);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!staffData) {
        const storedStaff = await AsyncStorage.getItem('staffData');
        if (storedStaff) setStaffData(JSON.parse(storedStaff));
      }
    };
    loadData();
  }, [staffData]);


  useEffect(() => {
    if (!staffData?.id && !staffData?.uid) return;
    const staffId = staffData.id || staffData.uid;

    if (!auth.currentUser) {
      console.warn("[Home] No Firebase Auth session. Redirecting...");
      AsyncStorage.removeItem('staffData');
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      return;
    }

    // Attendance Listener
    const qAttendance = query(
      collection(db, "attendance"),
      where("staff_id", "==", staffId)
    );

    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      let allLogs = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data({ serverTimestamps: 'estimate' }) as any)
      }));

      // Manual sort to avoid index requirements
      allLogs.sort((a, b) => {
        const dateA = a.clock_in?.toDate ? a.clock_in.toDate() : new Date(a.clock_in || 0);
        const dateB = b.clock_in?.toDate ? b.clock_in.toDate() : new Date(b.clock_in || 0);
        return dateB.getTime() - dateA.getTime();
      });

      console.log(`[Firestore] Fetched and sorted ${allLogs.length} total attendance records.`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // 1. Identify the active session (the most recent one without a clock_out)
      // Since allLogs is sorted by clock_in desc, the first one without clock_out is the active one.
      const active = allLogs.find(l => !l.clock_out);

      // 2. Filter for today's completed logs and the active one if it started today
      const todayLogs = allLogs.filter(l => {
        const cIn = l.clock_in?.toDate ? l.clock_in.toDate() : new Date(l.clock_in);
        return cIn >= today;
      });

      // 3. Filter for yesterday's logs
      const yesterdayLogs = allLogs.filter(l => {
        const cIn = l.clock_in?.toDate ? l.clock_in.toDate() : new Date(l.clock_in);
        return cIn >= yesterday && cIn < today;
      });

      setYesterdayLog(yesterdayLogs);

      if (active) {
        console.log(`[Clock] Active session found: ${active.id} (Started: ${active.clock_in?.toDate ? active.clock_in.toDate() : active.clock_in})`);
        setActiveSession(active);
        setIsClockedIn(true);

        // Calculate minutes worked today so far (excluding current active session to avoid double counting in timer)
        const previousMinutes = todayLogs.filter(l => l.id !== active.id).reduce((sum, l) => sum + (l.total_minutes || 0), 0);
        startTimer(active.clock_in, previousMinutes);
      } else {
        console.log("[Clock] No active session found.");
        setActiveSession(null);
        setIsClockedIn(false);
        stopTimer();
        const totalMin = todayLogs.reduce((sum, l) => sum + (l.total_minutes || 0), 0);
        setShiftMinutes(totalMin);
      }
    }, (error) => {
      console.error("[Firestore Attendance Query Error]:", error);
    });

    // Track which notifications have already been shown as popups during this session
    const shownNotifIds = new Set<string>();

    const qNotif = query(
      collection(db, "notifications"),
      where("staff_id", "==", staffId),
      where("status", "in", ["pending", "scheduled"])
    );

    // Use a Ref to store the latest notifications so the setInterval can access them safely
    const allNotificationsRef = { current: [] as any[] };

    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      allNotificationsRef.current = docs;
      
      // 1. Calculate Unread Count (Only for released/pending items)
      const visibleUnread = docs.filter((n: any) => {
        if (n.read) return false;
        if (n.status === 'scheduled' && n.scheduled_for) {
          const scheduledTime = n.scheduled_for.toDate ? n.scheduled_for.toDate().getTime() : new Date(n.scheduled_for).getTime();
          return Date.now() >= scheduledTime;
        }
        return n.status === 'pending';
      }).length;
      setUnreadCount(visibleUnread);

      // 2. Handle immediate popups for brand new arrivals
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const latest: any = { id: change.doc.id, ...change.doc.data() };
          if (shownNotifIds.has(latest.id)) return;

          const isPast = latest.scheduled_for ? (latest.scheduled_for.toDate ? latest.scheduled_for.toDate().getTime() : new Date(latest.scheduled_for).getTime()) <= Date.now() : true;
          
          if (latest.status === 'pending' || (latest.status === 'scheduled' && isPast)) {
            setActiveBanner(latest);
            shownNotifIds.add(latest.id);
            bannerY.value = withSpring(16, { damping: 15 });
            setTimeout(() => { bannerY.value = withTiming(-150); }, 5000);
          }
        }
      });
    });

    // 3. Time Monitor: Check the ALREADY LOADED notifications every 5 seconds
    const releaseMonitor = setInterval(() => {
      allNotificationsRef.current.forEach((n: any) => {
        if (n.status === 'scheduled' && n.scheduled_for && !shownNotifIds.has(n.id)) {
          const scheduledTime = n.scheduled_for.toDate ? n.scheduled_for.toDate().getTime() : new Date(n.scheduled_for).getTime();
          if (Date.now() >= scheduledTime) {
            // It's time! Show the popup
            setActiveBanner(n);
            shownNotifIds.add(n.id);
            bannerY.value = withSpring(16, { damping: 15 });
            setTimeout(() => { bannerY.value = withTiming(-150); }, 5000);
            
            // Re-calculate unread count
            const newCount = allNotificationsRef.current.filter((notif: any) => {
              if (notif.read) return false;
              const isScheduled = notif.status === 'scheduled' && notif.scheduled_for;
              const time = isScheduled ? (notif.scheduled_for.toDate ? notif.scheduled_for.toDate().getTime() : new Date(notif.scheduled_for).getTime()) : 0;
              return notif.status === 'pending' || (isScheduled && Date.now() >= time);
            }).length;
            setUnreadCount(newCount);
          }
        }
      });
    }, 5000);

    return () => {
      unsubAttendance();
      unsubNotif();
      clearInterval(releaseMonitor);
    };


  }, [staffData, startTimer, stopTimer, navigation]);

  useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'App needs access to your location.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            },
          );
          if (granted === PermissionsAndroid.RESULTS.GRANTED) getCurrentLocation();
          else setCurrentLocation('Location permission denied');
        } catch (err) {
          console.warn(err);
        }
      } else {
        getCurrentLocation();
      }
    };

    const getCurrentLocation = () => {
      Geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          reverseGeocode(latitude, longitude);
        },
        error => {
          console.log(error);
          setCurrentLocation('Unable to fetch GPS');
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
      );
    };

    const reverseGeocode = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          setCurrentLocation(data.results[0].formatted_address);
        } else {
          setCurrentLocation('Unknown Location');
        }
      } catch (error) {
        console.error('Geocode error:', error);
        setCurrentLocation('Location lookup failed');
      }
    };

    requestLocationPermission();
  }, []);

  const getFirstName = (fullName: string) => {
    if (!fullName) return 'Staff';
    return fullName.split(' ')[0];
  };

  const performClockAction = async () => {
    if (clockLoading || !staffData) {
      console.warn("[Clock] Action blocked: loading or missing staffData");
      return;
    }

    const staffId = staffData.id || staffData.uid;
    if (!staffId) {
      console.error("[Clock] Missing staff ID!");
      return;
    }

    setClockLoading(true);

    try {
      console.log(`[Clock] Attempting ${isClockedIn ? 'Clock Out' : 'Clock In'} for staff: ${staffId}`);

      if (!isClockedIn) {
        const newSession = {
          staff_id: staffId,
          clock_in: serverTimestamp(),
          clock_out: null,
          total_minutes: 0,
          date: serverTimestamp(),
          restaurant_id: staffData.restaurant_id || "",
          location_in: currentLocation
        };
        console.log("[Clock] Adding new session:", newSession);
        await addDoc(collection(db, "attendance"), newSession);
        console.log("[Clock] Session added successfully");
        setAlertConfig({
          visible: true,
          title: 'SUCCESS',
          message: 'You have successfully clocked in!',
          type: 'success',
        });
      } else {
        if (!activeSession?.id) {
          console.error("[Clock] No active session found to clock out of!");
          throw new Error("No active session ID");
        }

        const clockInDate = activeSession.clock_in?.toDate ? activeSession.clock_in.toDate() : new Date(activeSession.clock_in || Date.now());
        const now = new Date();
        const diffMs = now.getTime() - clockInDate.getTime();
        const totalMinutes = Math.floor(diffMs / 60000);

        console.log(`[Clock] Updating session ${activeSession.id}. Total minutes: ${totalMinutes}`);
        await updateDoc(doc(db, "attendance", activeSession.id), {
          clock_out: serverTimestamp(),
          total_minutes: totalMinutes,
          location_out: currentLocation
        });
        console.log("[Clock] Session updated successfully");
        setShowConfirmLogout(false);
        setAlertConfig({
          visible: true,
          title: 'SUCCESS',
          message: 'You have successfully clocked out. Great work today!',
          type: 'success',
        });
      }
    } catch (err: any) {

      console.error('[Clock Toggle Error]:', err);
      setAlertConfig({
        visible: true,
        title: 'ERROR',
        message: err.message || 'Operation failed. Please check your internet.',
        type: 'error',
      });
    } finally {
      setClockLoading(false);
    }

  };

  const handleClockToggle = async () => {
    if (clockLoading) return;
    if (isClockedIn) {
      setShowConfirmLogout(true);
    } else {
      performClockAction();
    }
  };



  const yesterdayIn = yesterdayLog.length > 0 && yesterdayLog[yesterdayLog.length - 1].clock_in
    ? formatTime(yesterdayLog[yesterdayLog.length - 1].clock_in)
    : '--';
  const yesterdayOut = yesterdayLog.length > 0 && yesterdayLog[0].clock_out
    ? formatTime(yesterdayLog[0].clock_out)
    : '--';
  const yesterdayTotal = yesterdayLog.reduce((sum: number, r: any) => sum + (r.total_minutes || 0), 0);
  const yesterdayDateStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  })();

  const shiftLabel = isClockedIn ? 'SHIFT DURATION:' : 'CLOCK-IN TIME:';
  const shiftValue = isClockedIn
    ? formatDuration(shiftMinutes)
    : activeSession?.clock_in
      ? formatTime(activeSession.clock_in)
      : '--:-- --';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" />

      {/* CUSTOM NOTIFICATION BANNER */}
      <Animated.View 
        style={[
          styles.notificationBanner, 
          { top: insets.top + 8 },
          useAnimatedStyle(() => ({
            transform: [{ translateY: bannerY.value }],
            opacity: withTiming(bannerY.value > -100 ? 1 : 0)
          }))
        ]}
      >
        <Pressable 
          style={styles.bannerContent}
          onPress={() => {
            bannerY.value = withTiming(-150);
            navigation.navigate('Notifications');
          }}
        >
          <View style={[styles.iconContainer, { backgroundColor: activeBanner?.priority === 'high' ? '#ef444420' : '#D0B07920' }]}>
            {activeBanner?.priority === 'high' ? (
              <AlertTriangle size={20} color="#ef4444" />
            ) : (
              <Bell size={20} color="#D0B079" />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              {activeBanner?.title || 'New Notification'}
            </Text>
            <Text style={styles.bannerBody} numberOfLines={1}>
              {activeBanner?.body || 'You have a new message'}
            </Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>
      </Animated.View>

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingText}>{greeting}, {getFirstName(staffData?.full_name)} 👋</Text>
          <View style={styles.locationBadge}>
            <Text style={{ fontSize: 12, marginRight: 4 }}>📍</Text>
            <Text style={styles.locationText} numberOfLines={1}>{currentLocation}</Text>
          </View>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => navigation.navigate('Notification')}
          >
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile', { staff: staffData })}>
            {staffData?.profile_image ? (
              <Image
                source={{ uri: staffData.profile_image }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#D0B079', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>{staffData?.full_name?.charAt(0)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View entering={FadeInDown.delay(200).duration(800)}>
        <LinearGradient colors={['#D0B079', '#B8965E']} style={styles.shiftCard}>
          <View style={styles.shiftHeader}>
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Today, {formatDate(currentDate)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isClockedIn ? '#10B981' : '#64748B' }]}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{isClockedIn ? 'ON DUTY' : 'OFF DUTY'}</Text>
            </View>
          </View>

          <View style={styles.shiftMainSlim}>
            <View>
              <Text style={styles.loginLabelSlim}>{shiftLabel}</Text>
              <Text style={styles.loginTimeSlim}>{shiftValue}</Text>
            </View>
            {isClockedIn && activeSession?.clock_in && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.startTimeLabel}>CLOCKED IN AT:</Text>
                <Text style={styles.startTimeValue}>{formatTime(activeSession.clock_in)}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={styles.clockSection}>
        <View style={styles.clockCenterContainer}>
          <View style={styles.clockOuterRing}>
            <TouchableOpacity
              style={[styles.clockButton, isClockedIn ? styles.clockButtonOut : styles.clockButtonIn]}
              onPress={handleClockToggle}
              activeOpacity={0.7}
              disabled={clockLoading}
            >
              <Text style={{ fontSize: 50 }}>
                {isClockedIn ? '⏹️' : '▶️'}
              </Text>
              <Text style={styles.clockActionText}>
                {clockLoading ? 'PROCESSING...' : (isClockedIn ? 'CLOCK\nOUT' : 'CLOCK\nIN')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.clockStatusContainer}>
          <View style={[styles.clockStatusDot, isClockedIn && styles.clockStatusDotActive]} />
          <Text style={styles.clockStatusText}>
            {isClockedIn ? 'CURRENTLY CLOCKED IN' : 'READY TO START'}
          </Text>
        </View>
        <Text style={styles.clockHint}>
          {isClockedIn ? 'System is recording your hours...' : 'Tap the button to start your shift'}
        </Text>
      </View>

      <View style={styles.bottomSection}>
        <Animated.View entering={FadeInUp.delay(500)} style={styles.yesterdayCard}>
          <View style={styles.yesterdayHeader}>
            <Text style={styles.yesterdayTitle}>Yesterday's log</Text>
            <Text style={styles.yesterdayDate}>{yesterdayDateStr}</Text>
          </View>
          <View style={styles.logRow}>
            <View style={styles.logItem}>
              <View style={[styles.logDot, { backgroundColor: '#10B981' }]} />
              <View>
                <Text style={styles.logLabelSmall}>IN</Text>
                <Text style={styles.logValue}>{yesterdayIn}</Text>
              </View>
            </View>
            <View style={styles.logDivider} />
            <View style={styles.logItem}>
              <View style={[styles.logDot, { backgroundColor: '#EF4444' }]} />
              <View>
                <Text style={styles.logLabelSmall}>OUT</Text>
                <Text style={styles.logValue}>{yesterdayOut}</Text>
              </View>
            </View>
            <View style={styles.logDivider} />
            <View style={styles.logItem}>
              <View style={[styles.logDot, { backgroundColor: '#D0B079' }]} />
              <View>
                <Text style={styles.logLabelSmall}>TOTAL</Text>
                <Text style={styles.logValue}>{yesterdayTotal > 0 ? formatDuration(yesterdayTotal) : '--'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      <View style={styles.tabContainer}>
        <View style={styles.floatingTab}>
          <TouchableOpacity style={styles.tabItem}>
            <View style={styles.tabIconActive}>
              <Text style={{ fontSize: 20 }}>🏠</Text>
            </View>
            <Text style={styles.tabLabelActive}>Home</Text>
          </TouchableOpacity>
          <View style={styles.tabSeparator} />
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Profile', { staff: staffData })}>
            <Text style={{ fontSize: 20 }}>👤</Text>
            <Text style={styles.tabLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CustomAlert
        visible={showConfirmLogout}
        title="CLOCK OUT"
        message="Are you sure you want to end your shift for today?"
        type="confirm"
        confirmText="CONFIRM"
        cancelText="CANCEL"
        onClose={() => setShowConfirmLogout(false)}
        onConfirm={performClockAction}
      />

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText="OK"
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 15 },
  greetingText: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4, maxWidth: '85%' },
  locationText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginRight: 10, elevation: 2 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white', paddingHorizontal: 4 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: '900' },
  avatar: { width: 40, height: 40, borderRadius: 10, borderWidth: 2, borderColor: 'white' },
  shiftCard: { marginHorizontal: 20, borderRadius: 20, padding: 16, elevation: 6 },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  todayBadge: { backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  todayText: { color: 'white', fontSize: 11, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'white', marginRight: 4 },
  statusText: { color: 'white', fontSize: 11, fontWeight: '700' },
  shiftMainSlim: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.15)' },
  loginLabelSlim: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 14, fontWeight: '600' },
  loginTimeSlim: { color: 'white', fontSize: 20, fontWeight: '800' },
  startTimeLabel: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 10, fontWeight: '700' },
  startTimeValue: { color: 'white', fontSize: 15, fontWeight: '700' },
  clockSection: { alignItems: 'center', paddingVertical: 15, flex: 1, justifyContent: 'center' },
  clockCenterContainer: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  rippleCircle: { position: 'absolute', width: 150, height: 150, borderRadius: 75, zIndex: -1, top: '50%', left: '50%', marginTop: -75, marginLeft: -75 },
  clockOuterRing: { width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(208, 176, 121, 0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(208, 176, 121, 0.15)' },
  clockButton: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  clockButtonIn: { backgroundColor: '#10B981' },
  clockButtonOut: { backgroundColor: '#EF4444' },
  clockActionText: { color: 'white', fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 6, letterSpacing: 1 },
  clockStatusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  clockStatusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#94A3B8', marginRight: 6 },
  clockStatusDotActive: { backgroundColor: '#10B981' },
  clockStatusText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  clockHint: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '500' },
  bottomSection: { paddingHorizontal: 20, marginBottom: 100 },
  yesterdayCard: { backgroundColor: 'white', padding: 16, borderRadius: 20, elevation: 2 },
  yesterdayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  yesterdayTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  yesterdayDate: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logItem: { flexDirection: 'row', alignItems: 'center' },
  logDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 6 },
  logLabelSmall: { fontSize: 9, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  logValue: { fontSize: 13, fontWeight: '700', color: '#334155' },
  logDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0' },
  tabContainer: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  floatingTab: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, alignItems: 'center', elevation: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 12 },
  tabIconActive: { backgroundColor: '#FFFBEB', padding: 5, borderRadius: 8, marginRight: 6 },
  tabSeparator: { width: 1, height: 20, backgroundColor: '#E2E8F0' },
  tabLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  tabLabelActive: { fontSize: 11, fontWeight: '700', color: '#D0B079' },
  notificationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(208, 176, 121, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.3,
  },
  bannerBody: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
});

export default HomeScreen;
