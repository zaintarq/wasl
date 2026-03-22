import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Export Service
 * Exports analytics data and reports to various formats
 */
export const exportService = {
  /**
   * Export data to CSV format
   * @param {array} data - Array of objects to export
   * @param {string} filename - Filename for export
   */
  async exportToCsv(data, filename = 'export.csv') {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        return { error: 'No data to export' };
      }

      // Get headers from first object
      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(',')];

      // Convert data to CSV rows
      data.forEach((row) => {
        const values = headers.map((header) => {
          const value = row[header];
          // Handle objects, arrays, and special characters
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
          return String(value).replace(/"/g, '""');
        });
        csvRows.push(`"${values.join('","')}"`);
      });

      const csvContent = csvRows.join('\n');

      // Save to file
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
      }

      return { fileUri, error: null };
    } catch (error) {
      console.error('[Export] Export to CSV error:', error);
      return { fileUri: null, error: error.message };
    }
  },

  /**
   * Export data to JSON format
   * @param {array} data - Array of objects to export
   * @param {string} filename - Filename for export
   */
  async exportToJson(data, filename = 'export.json') {
    try {
      if (!Array.isArray(data)) {
        return { error: 'Data must be an array' };
      }

      const jsonContent = JSON.stringify(data, null, 2);

      // Save to file
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
      }

      return { fileUri, error: null };
    } catch (error) {
      console.error('[Export] Export to JSON error:', error);
      return { fileUri: null, error: error.message };
    }
  },

  /**
   * Export analytics data
   * @param {object} analyticsData - Analytics data object
   * @param {string} format - Export format ('csv' or 'json')
   */
  async exportAnalytics(analyticsData, format = 'json') {
    try {
      // Convert analytics data to array format
      const exportData = [];

      // Registration data
      if (analyticsData.registration) {
        exportData.push({
          type: 'registration',
          ...analyticsData.registration,
        });
      }

      // Demographics
      if (analyticsData.demographics) {
        exportData.push({
          type: 'demographics',
          ...analyticsData.demographics,
        });
      }

      // Engagement metrics
      if (analyticsData.engagement) {
        exportData.push({
          type: 'engagement',
          ...analyticsData.engagement,
        });
      }

      if (format === 'csv') {
        return await this.exportToCsv(exportData, `analytics_${Date.now()}.csv`);
      } else {
        return await this.exportToJson(exportData, `analytics_${Date.now()}.json`);
      }
    } catch (error) {
      console.error('[Export] Export analytics error:', error);
      return { fileUri: null, error: error.message };
    }
  },

  /**
   * Export user list
   * @param {array} users - Array of user objects
   * @param {object} filters - Applied filters (for filename)
   * @param {string} format - Export format ('csv' or 'json')
   */
  async exportUserList(users, filters = {}, format = 'csv') {
    try {
      if (!Array.isArray(users) || users.length === 0) {
        return { error: 'No users to export' };
      }

      // Flatten user data for export
      const exportData = users.map((user) => ({
        id: user.id || user.uid || '',
        name: user.name || '',
        email: user.email || '',
        age: user.age || '',
        gender: user.gender || '',
        religion: user.religion || '',
        country: user.country || '',
        city: user.city || '',
        approvalStatus: user.approvalStatus || 'approved',
        role: user.role || 'user',
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
      }));

      const filename = `users_${filters.approvalStatus || 'all'}_${Date.now()}.${format === 'csv' ? 'csv' : 'json'}`;

      if (format === 'csv') {
        return await this.exportToCsv(exportData, filename);
      } else {
        return await this.exportToJson(exportData, filename);
      }
    } catch (error) {
      console.error('[Export] Export user list error:', error);
      return { fileUri: null, error: error.message };
    }
  },

  /**
   * Generate PDF report (placeholder - would require PDF library)
   * @param {string} reportType - Type of report
   */
  async generatePdfReport(reportType) {
    try {
      // PDF generation would require a library like react-native-pdf or similar
      // For now, we'll export as JSON and let user convert if needed
      Alert.alert(
        'PDF Export',
        'PDF generation is not yet implemented. Please use CSV or JSON export instead.'
      );
      return { error: 'PDF generation not implemented' };
    } catch (error) {
      console.error('[Export] Generate PDF report error:', error);
      return { error: error.message };
    }
  },
};
