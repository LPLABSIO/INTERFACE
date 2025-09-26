const { log } = require('./utils');

/**
 * Progress Tracker for detailed step-by-step progress reporting
 */
class ProgressTracker {
  constructor() {
    this.steps = [];
    this.currentStepIndex = -1;
    this.totalSteps = 0;
    this.onProgressUpdate = null;
    this.deviceId = null;
    this.taskId = null;
  }

  /**
   * Initialize the progress tracker with all steps
   */
  initializeSteps(appType = 'hinge-fast') {
    if (appType === 'hinge-fast') {
      this.steps = [
        // Setup Phase
        { id: 'app_start', name: 'Démarrage de l\'application', weight: 2 },
        { id: 'create_account', name: 'Clic sur Create Account', weight: 3 },

        // Phone & SMS Phase
        { id: 'phone_input', name: 'Saisie du numéro de téléphone', weight: 2 },
        { id: 'phone_next', name: 'Validation du téléphone', weight: 1 },
        { id: 'sms_wait', name: 'Attente du code SMS', weight: 5 },
        { id: 'sms_input', name: 'Saisie du code SMS', weight: 2 },
        { id: 'sms_next', name: 'Validation SMS', weight: 1 },

        // Basic Info Phase
        { id: 'basic_info', name: 'Informations de base', weight: 2 },
        { id: 'first_name', name: 'Saisie du prénom', weight: 2 },
        { id: 'name_next', name: 'Validation du prénom', weight: 1 },

        // Email Phase
        { id: 'email_skip', name: 'Skip notifications', weight: 1 },
        { id: 'email_input', name: 'Saisie de l\'email', weight: 2 },
        { id: 'email_next', name: 'Validation de l\'email', weight: 1 },
        { id: 'email_code_wait', name: 'Attente du code email', weight: 5 },
        { id: 'email_code_input', name: 'Saisie du code email', weight: 2 },
        { id: 'email_code_next', name: 'Validation code email', weight: 1 },

        // Birthday Phase
        { id: 'birthday_month', name: 'Sélection du mois', weight: 1 },
        { id: 'birthday_day', name: 'Sélection du jour', weight: 1 },
        { id: 'birthday_year', name: 'Saisie de l\'année', weight: 2 },
        { id: 'birthday_next', name: 'Validation date de naissance', weight: 1 },
        { id: 'birthday_confirm', name: 'Confirmation âge', weight: 1 },

        // Profile Details Phase
        { id: 'notifications', name: 'Configuration notifications', weight: 1 },
        { id: 'add_details', name: 'Ajout détails profil', weight: 1 },
        { id: 'location_setup', name: 'Configuration localisation', weight: 3 },
        { id: 'gender_select', name: 'Sélection du genre', weight: 2 },
        { id: 'preferences', name: 'Préférences de match', weight: 3 },

        // Relationship Goals
        { id: 'relationship_goal', name: 'Objectif relationnel', weight: 2 },
        { id: 'monogamy', name: 'Préférence monogamie', weight: 1 },

        // Demographics
        { id: 'ethnicity', name: 'Origine ethnique', weight: 2 },
        { id: 'children_status', name: 'Statut enfants', weight: 1 },
        { id: 'children_pref', name: 'Préférence enfants', weight: 1 },
        { id: 'hometown', name: 'Ville d\'origine', weight: 2 },

        // Lifestyle
        { id: 'religion', name: 'Religion', weight: 2 },
        { id: 'political', name: 'Orientation politique', weight: 1 },
        { id: 'drinking', name: 'Consommation alcool', weight: 1 },
        { id: 'smoking', name: 'Tabagisme', weight: 1 },
        { id: 'cannabis', name: 'Cannabis', weight: 1 },
        { id: 'drugs', name: 'Drogues', weight: 1 },

        // Photos & Prompts
        { id: 'photos_upload', name: 'Upload photos', weight: 5 },
        { id: 'prompt_1', name: 'Premier prompt', weight: 3 },
        { id: 'prompt_2', name: 'Deuxième prompt', weight: 3 },
        { id: 'prompt_3', name: 'Troisième prompt', weight: 3 },

        // Finalization
        { id: 'profile_complete', name: 'Finalisation du profil', weight: 2 },
        { id: 'account_ready', name: 'Compte prêt', weight: 1 }
      ];
    }

    this.totalSteps = this.steps.length;
    this.currentStepIndex = -1;

    // Calculate total weight for percentage
    this.totalWeight = this.steps.reduce((sum, step) => sum + step.weight, 0);
  }

  /**
   * Set callback for progress updates
   */
  setProgressCallback(callback, deviceId = null, taskId = null) {
    this.onProgressUpdate = callback;
    this.deviceId = deviceId;
    this.taskId = taskId;
  }

  /**
   * Move to a specific step by ID
   */
  moveToStep(stepId) {
    const stepIndex = this.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      log(`Warning: Unknown step ID: ${stepId}`);
      return;
    }

    this.currentStepIndex = stepIndex;
    this.reportProgress();
  }

  /**
   * Move to next step
   */
  nextStep() {
    if (this.currentStepIndex < this.totalSteps - 1) {
      this.currentStepIndex++;
      this.reportProgress();
    }
  }

  /**
   * Get current progress percentage (0-100)
   */
  getProgressPercentage() {
    if (this.currentStepIndex < 0) return 0;
    if (this.currentStepIndex >= this.totalSteps - 1) return 100;

    // Calculate based on weights
    let completedWeight = 0;
    for (let i = 0; i <= this.currentStepIndex; i++) {
      completedWeight += this.steps[i].weight;
    }

    return Math.round((completedWeight / this.totalWeight) * 100);
  }

  /**
   * Get current step info
   */
  getCurrentStep() {
    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.totalSteps) {
      return null;
    }
    return this.steps[this.currentStepIndex];
  }

  /**
   * Report progress to callback
   */
  reportProgress() {
    const currentStep = this.getCurrentStep();
    const percentage = this.getProgressPercentage();

    const progressData = {
      deviceId: this.deviceId,
      taskId: this.taskId,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.totalSteps,
      percentage: percentage,
      currentStep: currentStep ? currentStep.name : 'Initialisation',
      stepId: currentStep ? currentStep.id : null,
      timestamp: Date.now()
    };

    log(`📊 Progress: [${percentage}%] ${currentStep ? currentStep.name : 'Starting...'}`);

    // Call callback if set
    if (this.onProgressUpdate) {
      this.onProgressUpdate(progressData);
    }

    // Also emit via IPC if available
    if (typeof process !== 'undefined' && process.send) {
      process.send({
        type: 'progress-update',
        data: progressData
      });
    }
  }

  /**
   * Reset progress
   */
  reset() {
    this.currentStepIndex = -1;
    this.reportProgress();
  }

  /**
   * Mark as completed
   */
  complete() {
    this.currentStepIndex = this.totalSteps - 1;
    this.reportProgress();
  }

  /**
   * Get all steps for UI display
   */
  getAllSteps() {
    return this.steps.map((step, index) => ({
      ...step,
      completed: index <= this.currentStepIndex,
      current: index === this.currentStepIndex,
      percentage: this.getStepPercentage(index)
    }));
  }

  /**
   * Get percentage for a specific step
   */
  getStepPercentage(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.totalSteps) return 0;

    let weight = 0;
    for (let i = 0; i <= stepIndex; i++) {
      weight += this.steps[i].weight;
    }

    return Math.round((weight / this.totalWeight) * 100);
  }
}

// Singleton instance
let progressTracker = null;

/**
 * Get or create progress tracker instance
 */
function getProgressTracker() {
  if (!progressTracker) {
    progressTracker = new ProgressTracker();
  }
  return progressTracker;
}

/**
 * Create a new progress tracker instance
 */
function createProgressTracker() {
  return new ProgressTracker();
}

module.exports = {
  ProgressTracker,
  getProgressTracker,
  createProgressTracker
};