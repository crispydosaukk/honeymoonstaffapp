import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  Alert,
  Modal,
  Pressable
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from 'firebase/firestore';

import { auth, db } from '../lib/firebase';

const { width } = Dimensions.get('window');

const ProfileScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const staff = route?.params?.staff;
  const [activeTab, setActiveTab] = useState('Personal');
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const isClockedIn = route?.params?.isClockedIn;
  const activeSession = route?.params?.activeSession;

  const performLogout = async () => {
    setIsLoggingOut(true);
    try {
      await auth.signOut();
      await AsyncStorage.removeItem('staffData');
      await AsyncStorage.removeItem('staffToken');
    } catch (error) {
      console.error('Error logging out:', error);
    }
    setLogoutModalVisible(false);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const confirmLogoutAction = async () => {
    if (isClockedIn && activeSession) {
      try {
        // Auto clock out logic
        const now = new Date();
        const cinDate = activeSession.clock_in?.toDate ? activeSession.clock_in.toDate() : new Date(activeSession.clock_in);
        const diffMin = Math.max(1, Math.round((now.getTime() - cinDate.getTime()) / 60000));
        const safeDiffMin = Math.min(diffMin, 1440);
        
        await updateDoc(doc(db, "attendance", activeSession.id), {
          clock_out: now,
          total_minutes: Math.max(0, safeDiffMin),
          location_out: "Auto logged out"
        });
      } catch (e) {
        console.error("Error auto clocking out on logout:", e);
      }
    }
    await performLogout();
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };


  const DetailItem = ({ label, value, fullWidth = false }: { label: string, value: string, fullWidth?: boolean }) => (
    <View style={[styles.detailItem, fullWidth && styles.fullWidthDetail]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueContainer}>
        <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">{value || 'Not provided'}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <View style={styles.backButtonInner}>
            <Text style={{ fontSize: 20 }}>⬅️</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={[styles.mainContent, { paddingBottom: insets.bottom + 10 }]}>
        {/* Profile Card */}
        <Animated.View style={styles.profileCard}>
          <View style={styles.profileContent}>
            <View style={styles.avatarContainer}>
              {staff?.profile_image ? (
                <Image 
                  source={{ uri: staff.profile_image }} 
                  style={styles.avatar} 
                />

              ) : (
                <View style={[styles.avatar, { backgroundColor: '#D0B079', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>{staff?.full_name?.charAt(0)}</Text>
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>{staff?.full_name || 'Staff Member'}</Text>
              <View style={styles.empCodeBadge}>
                <Text style={styles.empCodeLabel}>{staff?.employee_id || 'ID PENDING'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Tab Buttons */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'Personal' && styles.tabButtonActive]}
            onPress={() => setActiveTab('Personal')}
          >
            <Text style={{ fontSize: 18 }}>👤</Text>
            <Text style={[styles.tabText, activeTab === 'Personal' && styles.tabTextActive]}>Personal</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'Contact' && styles.tabButtonActive]}
            onPress={() => setActiveTab('Contact')}
          >
            <Text style={{ fontSize: 18 }}>📞</Text>
            <Text style={[styles.tabText, activeTab === 'Contact' && styles.tabTextActive]}>Contact</Text>
          </TouchableOpacity>
        </View>

        {/* Details Section */}
        <Animated.View style={styles.detailsCard}>
          <View style={styles.detailsHeader}>
            <View style={styles.detailsHeaderLeft}>
              <View style={styles.iconCircle}>
                <Text style={{ fontSize: 18 }}>{activeTab === 'Personal' ? '👤' : '📞'}</Text>
              </View>
              <Text style={styles.detailsTitle}>{activeTab} Details</Text>
            </View>
          </View>

          <View style={styles.detailsGrid}>
            {activeTab === 'Personal' ? (
              <>
                <DetailItem label="Full Name" value={staff?.full_name} fullWidth />
                <DetailItem label="Designation" value={staff?.designation} />
                <DetailItem label="Gender" value={staff?.gender} />
                <DetailItem label="Date of Birth" value={staff?.dob ? staff.dob.split('T')[0] : null} />
                <DetailItem label="Assigned To" value={staff?.restaurant_name} />
              </>
            ) : (
              <>
                <DetailItem label="Email Address" value={staff?.email} fullWidth />
                <DetailItem label="Phone Number" value={staff?.phone_number} fullWidth />
              </>
            )}
          </View>
        </Animated.View>

        {/* Logout Button */}
        <Animated.View style={styles.logoutContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>🚪</Text>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Custom Logout Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={logoutModalVisible}
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            entering={ZoomIn.duration(200).springify()}
            exiting={ZoomOut.duration(150)}
            style={styles.modalContent}
          >
            <View style={styles.modalIconContainer}>
              <Text style={{ fontSize: 32 }}>🚪</Text>
            </View>
            
            <Text style={styles.modalTitle}>
              {isClockedIn ? "Active Shift Detected" : "Confirm Logout"}
            </Text>
            
            <Text style={styles.modalMessage}>
              {isClockedIn 
                ? "You are currently clocked in. Logging out will automatically clock you out of your active session. Do you wish to proceed?"
                : "Are you sure you want to log out of your profile?"}
            </Text>
            
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancelButton]} 
                onPress={() => setLogoutModalVisible(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalConfirmButton]} 
                onPress={confirmLogoutAction}
                disabled={isLoggingOut}
              >
                <Text style={styles.modalConfirmText}>
                  {isLoggingOut ? "Logging out..." : (isClockedIn ? "Log Out & Clock Out" : "Log Out")}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  profileCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#F1F5F9',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#D0B079',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  empCodeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  empCodeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabButtonActive: {
    borderColor: '#D0B079',
    backgroundColor: '#FFFBEB',
  },
  tabText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#D0B079',
  },
  detailsCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  editButton: {
    padding: 4,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  detailItem: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  fullWidthDetail: {
    width: '100%',
  },
  detailLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
    fontWeight: '600',
  },
  detailValueContainer: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  logoutContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  logoutIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F1F5F9',
  },
  modalConfirmButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modalCancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
  modalConfirmText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ProfileScreen;
