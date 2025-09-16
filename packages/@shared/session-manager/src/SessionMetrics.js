/**
 * Gestionnaire de métriques pour les sessions
 */
class SessionMetrics {
  constructor() {
    this.metrics = {
      totalSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      averageDuration: 0,
      successRate: 0,
      deviceMetrics: new Map(),
      errorCounts: new Map(),
      lastUpdated: null
    };
  }

  /**
   * Enregistrer une session complétée
   */
  recordSessionCompleted(deviceId, duration, results = {}) {
    this.metrics.totalSessions++;
    this.metrics.completedSessions++;
    
    // Mettre à jour la durée moyenne
    const currentAvg = this.metrics.averageDuration;
    const currentCount = this.metrics.completedSessions - 1;
    this.metrics.averageDuration = 
      (currentAvg * currentCount + duration) / this.metrics.completedSessions;
    
    // Mettre à jour les métriques par appareil
    if (!this.deviceMetrics.has(deviceId)) {
      this.deviceMetrics.set(deviceId, {
        totalSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        averageDuration: 0,
        lastSession: null
      });
    }
    
    const deviceMetric = this.deviceMetrics.get(deviceId);
    deviceMetric.totalSessions++;
    deviceMetric.completedSessions++;
    deviceMetric.averageDuration = 
      (deviceMetric.averageDuration * (deviceMetric.completedSessions - 1) + duration) / 
      deviceMetric.completedSessions;
    deviceMetric.lastSession = new Date().toISOString();
    
    // Mettre à jour le taux de succès
    this.updateSuccessRate();
    
    // Enregistrer les résultats
    if (results.accountsCreated) {
      deviceMetric.totalAccountsCreated = 
        (deviceMetric.totalAccountsCreated || 0) + results.accountsCreated;
    }
    
    this.metrics.lastUpdated = new Date().toISOString();
  }

  /**
   * Enregistrer une session échouée
   */
  recordSessionFailed(deviceId, error) {
    this.metrics.totalSessions++;
    this.metrics.failedSessions++;
    
    // Mettre à jour les métriques par appareil
    if (!this.deviceMetrics.has(deviceId)) {
      this.deviceMetrics.set(deviceId, {
        totalSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        averageDuration: 0,
        lastSession: null
      });
    }
    
    const deviceMetric = this.deviceMetrics.get(deviceId);
    deviceMetric.totalSessions++;
    deviceMetric.failedSessions++;
    deviceMetric.lastSession = new Date().toISOString();
    deviceMetric.lastError = error.message;
    
    // Compter les erreurs par type
    const errorType = this.categorizeError(error);
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
    
    // Mettre à jour le taux de succès
    this.updateSuccessRate();
    this.metrics.lastUpdated = new Date().toISOString();
  }

  /**
   * Catégoriser une erreur
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('connection')) return 'connection';
    if (message.includes('appium')) return 'appium';
    if (message.includes('wda') || message.includes('webdriver')) return 'wda';
    if (message.includes('device')) return 'device';
    if (message.includes('network')) return 'network';
    if (message.includes('proxy')) return 'proxy';
    if (message.includes('captcha')) return 'captcha';
    if (message.includes('banned') || message.includes('suspended')) return 'banned';
    
    return 'unknown';
  }

  /**
   * Mettre à jour le taux de succès
   */
  updateSuccessRate() {
    if (this.metrics.totalSessions > 0) {
      this.metrics.successRate = 
        (this.metrics.completedSessions / this.metrics.totalSessions) * 100;
    }
  }

  /**
   * Obtenir les métriques globales
   */
  getMetrics() {
    return {
      ...this.metrics,
      deviceMetrics: Array.from(this.deviceMetrics.entries()).map(([id, metrics]) => ({
        deviceId: id,
        ...metrics
      })),
      errorDistribution: Array.from(this.errorCounts.entries()).map(([type, count]) => ({
        type,
        count,
        percentage: (count / this.metrics.failedSessions) * 100
      }))
    };
  }

  /**
   * Obtenir les métriques d'un appareil
   */
  getDeviceMetrics(deviceId) {
    return this.deviceMetrics.get(deviceId) || {
      totalSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      averageDuration: 0,
      lastSession: null
    };
  }

  /**
   * Obtenir le classement des appareils par performance
   */
  getDeviceRanking() {
    const devices = Array.from(this.deviceMetrics.entries());
    
    return devices
      .map(([id, metrics]) => ({
        deviceId: id,
        successRate: metrics.totalSessions > 0 
          ? (metrics.completedSessions / metrics.totalSessions) * 100 
          : 0,
        totalSessions: metrics.totalSessions,
        averageDuration: metrics.averageDuration
      }))
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Obtenir les tendances d'erreurs
   */
  getErrorTrends() {
    return Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        count,
        percentage: this.metrics.failedSessions > 0 
          ? (count / this.metrics.failedSessions) * 100 
          : 0
      }));
  }

  /**
   * Réinitialiser les métriques
   */
  reset() {
    this.metrics = {
      totalSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      averageDuration: 0,
      successRate: 0,
      deviceMetrics: new Map(),
      errorCounts: new Map(),
      lastUpdated: null
    };
  }

  /**
   * Exporter les métriques en JSON
   */
  toJSON() {
    return {
      ...this.metrics,
      deviceMetrics: Object.fromEntries(this.deviceMetrics),
      errorCounts: Object.fromEntries(this.errorCounts)
    };
  }

  /**
   * Importer les métriques depuis JSON
   */
  fromJSON(data) {
    this.metrics = {
      ...data,
      deviceMetrics: new Map(Object.entries(data.deviceMetrics || {})),
      errorCounts: new Map(Object.entries(data.errorCounts || {}))
    };
  }
}

module.exports = SessionMetrics;