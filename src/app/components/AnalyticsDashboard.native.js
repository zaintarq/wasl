import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { userService, matchAnalyticsService, exportService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';

const SCREEN_WIDTH = Dimensions.get('window').width;

export function AnalyticsDashboard({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d'); // '1d', '7d', '30d', 'all'
  const [analytics, setAnalytics] = useState({
    registration: null,
    demographics: null,
    engagement: null,
    matchStats: null,
  });

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Get time range
      const now = new Date();
      let startDate = null;
      if (timeRange === '1d') {
        startDate = subDays(now, 1);
      } else if (timeRange === '7d') {
        startDate = subDays(now, 7);
      } else if (timeRange === '30d') {
        startDate = subDays(now, 30);
      }

      // Load all users
      const usersSnap = await getDocs(query(collection(db, 'users'), limit(1000)));
      const allUsers = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      // Filter by time range
      let users = allUsers;
      if (startDate) {
        users = users.filter((u) => u.createdAt >= startDate.getTime());
      }

      // Registration analytics
      const registrationData = calculateRegistrationRate(users, timeRange);

      // Demographics
      const demographics = calculateDemographics(users);

      // Engagement metrics
      const engagement = await calculateEngagementMetrics(allUsers);

      // Match analytics
      const matchStats = await matchAnalyticsService.getMatchStats();

      setAnalytics({
        registration: registrationData,
        demographics,
        engagement,
        matchStats,
      });
    } catch (error) {
      console.error('[Analytics] Load error:', error);
      Alert.alert('Error', 'Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  const calculateRegistrationRate = (users, range) => {
    const now = new Date();
    let days = 7;
    if (range === '1d') days = 1;
    else if (range === '30d') days = 30;
    else if (range === 'all') days = Math.ceil((now.getTime() - Math.min(...users.map((u) => u.createdAt))) / (1000 * 60 * 60 * 24));

    const dailyCounts = {};
    for (let i = 0; i < days; i++) {
      const date = subDays(now, days - 1 - i);
      const dateKey = format(date, 'yyyy-MM-dd');
      dailyCounts[dateKey] = 0;
    }

    users.forEach((user) => {
      const date = new Date(user.createdAt);
      const dateKey = format(date, 'yyyy-MM-dd');
      if (dailyCounts[dateKey] !== undefined) {
        dailyCounts[dateKey]++;
      }
    });

    return {
      labels: Object.keys(dailyCounts),
      datasets: [
        {
          data: Object.values(dailyCounts),
        },
      ],
    };
  };

  const calculateDemographics = (users) => {
    const genderCounts = { male: 0, female: 0, other: 0 };
    const religionCounts = {};
    const muslimCount = { muslim: 0, nonMuslim: 0 };
    const ageGroups = { '18-24': 0, '25-29': 0, '30-34': 0, '35+': 0 };

    users.forEach((user) => {
      // Gender
      const gender = String(user.gender || '').toLowerCase();
      if (gender === 'male') genderCounts.male++;
      else if (gender === 'female') genderCounts.female++;
      else genderCounts.other++;

      // Religion
      const religion = user.religion || 'Unknown';
      religionCounts[religion] = (religionCounts[religion] || 0) + 1;

      // Muslim vs non-Muslim
      if (religion === 'Islam') muslimCount.muslim++;
      else muslimCount.nonMuslim++;

      // Age groups
      const age = user.age || 0;
      if (age < 25) ageGroups['18-24']++;
      else if (age < 30) ageGroups['25-29']++;
      else if (age < 35) ageGroups['30-34']++;
      else ageGroups['35+']++;
    });

    return {
      gender: genderCounts,
      religion: religionCounts,
      muslim: muslimCount,
      ageGroups,
    };
  };

  const calculateEngagementMetrics = async (users) => {
    // Calculate DAU, MAU, retention (simplified)
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // For now, we'll use user creation as a proxy for activity
    // In a real implementation, you'd check activityService
    const dau = users.filter((u) => u.lastSeen && u.lastSeen > oneDayAgo).length;
    const mau = users.filter((u) => u.lastSeen && u.lastSeen > oneMonthAgo).length;

    return {
      dau: dau || users.length, // Fallback
      mau: mau || users.length,
      totalUsers: users.length,
    };
  };

  const handleExport = async (format) => {
    try {
      const exportData = {
        registration: analytics.registration,
        demographics: analytics.demographics,
        engagement: analytics.engagement,
        matchStats: analytics.matchStats,
      };

      if (format === 'csv') {
        await exportService.exportAnalytics(exportData, 'csv');
      } else {
        await exportService.exportAnalytics(exportData, 'json');
      }
    } catch (error) {
      Alert.alert('Export Error', error.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const chartConfig = {
    backgroundColor: tokens.colors.surface,
    backgroundGradientFrom: tokens.colors.surface,
    backgroundGradientTo: tokens.colors.bg,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(139, 69, 19, ${opacity})`, // Brown
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: tokens.colors.accent,
    },
  };

  const genderData = analytics.demographics?.gender || { male: 0, female: 0, other: 0 };
  const genderChartData = [
    { name: 'Male', population: genderData.male, color: '#4682b4', legendFontColor: '#000' },
    { name: 'Female', population: genderData.female, color: '#ff69b4', legendFontColor: '#000' },
    { name: 'Other', population: genderData.other, color: '#90ee90', legendFontColor: '#000' },
  ];

  const muslimData = analytics.demographics?.muslim || { muslim: 0, nonMuslim: 0 };
  const muslimChartData = [
    { name: 'Muslim', population: muslimData.muslim, color: '#228b22', legendFontColor: '#000' },
    { name: 'Non-Muslim', population: muslimData.nonMuslim, color: '#ff6347', legendFontColor: '#000' },
  ];

  const ageData = analytics.demographics?.ageGroups || {};
  const ageChartData = {
    labels: Object.keys(ageData),
    datasets: [
      {
        data: Object.values(ageData),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        <View style={styles.headerRight}>
          <HuzzPressable style={styles.exportBtn} onPress={() => handleExport('csv')} haptic="light">
            <Text style={styles.exportBtnText}>CSV</Text>
          </HuzzPressable>
          <HuzzPressable style={styles.exportBtn} onPress={() => handleExport('json')} haptic="light">
            <Text style={styles.exportBtnText}>JSON</Text>
          </HuzzPressable>
        </View>
      </View>

      <View style={styles.timeRangeContainer}>
        {['1d', '7d', '30d', 'all'].map((range) => (
          <HuzzPressable
            key={range}
            style={[styles.timeRangeBtn, timeRange === range && styles.timeRangeBtnActive]}
            onPress={() => setTimeRange(range)}
            haptic="light"
          >
            <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextActive]}>
              {range === '1d' ? '1 Day' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All'}
            </Text>
          </HuzzPressable>
        ))}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Registration Rate */}
        {analytics.registration && (
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>Registration Rate</Text>
            <LineChart
              data={analytics.registration}
              width={SCREEN_WIDTH - 40}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
          </View>
        )}

        {/* Gender Breakdown */}
        {genderChartData.some((d) => d.population > 0) && (
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>Gender Distribution</Text>
            <PieChart
              data={genderChartData}
              width={SCREEN_WIDTH - 40}
              height={220}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
            />
          </View>
        )}

        {/* Muslim vs Non-Muslim */}
        {muslimChartData.some((d) => d.population > 0) && (
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>Muslim vs Non-Muslim</Text>
            <PieChart
              data={muslimChartData}
              width={SCREEN_WIDTH - 40}
              height={220}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
            />
          </View>
        )}

        {/* Age Distribution */}
        {Object.values(ageData).some((v) => v > 0) && (
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>Age Distribution</Text>
            <BarChart
              data={ageChartData}
              width={SCREEN_WIDTH - 40}
              height={220}
              chartConfig={chartConfig}
              verticalLabelRotation={0}
              style={styles.chart}
            />
          </View>
        )}

        {/* Engagement Metrics */}
        {analytics.engagement && (
          <View style={styles.metricsBox}>
            <Text style={styles.metricsTitle}>Engagement Metrics</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Daily Active Users:</Text>
              <Text style={styles.metricValue}>{analytics.engagement.dau}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Monthly Active Users:</Text>
              <Text style={styles.metricValue}>{analytics.engagement.mau}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Users:</Text>
              <Text style={styles.metricValue}>{analytics.engagement.totalUsers}</Text>
            </View>
          </View>
        )}

        {/* Match Stats */}
        {analytics.matchStats && (
          <View style={styles.metricsBox}>
            <Text style={styles.metricsTitle}>Match Statistics</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Matches:</Text>
              <Text style={styles.metricValue}>{analytics.matchStats.totalMatches}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Approval Rate:</Text>
              <Text style={styles.metricValue}>{analytics.matchStats.approvalRate.toFixed(1)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Match to Chat Rate:</Text>
              <Text style={styles.metricValue}>{analytics.matchStats.matchToChatRate.toFixed(1)}%</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 3,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.bg,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    backgroundColor: tokens.colors.surface,
  },
  exportBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: tokens.colors.text,
    textTransform: 'uppercase',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: tokens.colors.border,
  },
  timeRangeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  timeRangeBtnActive: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.borderDark,
  },
  timeRangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  timeRangeTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  chartBox: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  metricsBox: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  metricsTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.accent,
  },
});
