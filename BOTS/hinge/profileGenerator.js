const profiles = require('./profiles.json');

/**
 * Génère un profil Hinge aléatoire cohérent
 * @param {string} gender - 'male' ou 'female'
 * @returns {Object} Profil complet avec toutes les données
 */
function generateProfile(gender = 'female') {
  const profile = {
    // Informations de base
    firstName: getRandomFromArray(profiles.firstNames[gender]),
    birthDate: generateBirthDate(),
    gender: gender,

    // Préférences de relation
    relationshipGoal: getRandomFromArray(profiles.relationshipGoals),

    // Informations démographiques
    ethnicity: getRandomFromArray(profiles.ethnicities),
    height: getRandomFromArray(profiles.height[gender]),
    education: getRandomFromArray(profiles.education),
    religion: getRandomFromArray(profiles.religion),

    // Style de vie
    children: 'Don\'t have children',
    childrenPreference: getRandomFromArray(profiles.childrenPreference),
    drinking: getRandomFromArray(profiles.drinking),
    smoking: getRandomFromArray(profiles.smoking),
    cannabis: getRandomFromArray(profiles.cannabis),
    drugs: 'No', // Toujours "No" pour éviter les problèmes

    // Prompts (3 requis)
    prompts: generatePrompts()
  };

  return profile;
}

/**
 * Génère une date de naissance aléatoire (21-28 ans)
 */
function generateBirthDate() {
  const currentYear = new Date().getFullYear();
  const age = Math.floor(Math.random() * 8) + 21; // 21-28 ans
  const year = currentYear - age;
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;

  return {
    day: day.toString().padStart(2, '0'),
    month: month.toString().padStart(2, '0'),
    year: year.toString()
  };
}

/**
 * Génère 3 prompts avec réponses cohérentes
 */
function generatePrompts() {
  const selectedPrompts = [];

  // Prompt 1
  const prompt1 = getRandomFromArray(profiles.prompts.prompt1);
  const answer1 = profiles.promptAnswers[prompt1]
    ? getRandomFromArray(profiles.promptAnswers[prompt1])
    : generateGenericAnswer(prompt1);
  selectedPrompts.push({ prompt: prompt1, answer: answer1 });

  // Prompt 2
  const prompt2 = getRandomFromArray(profiles.prompts.prompt2);
  const answer2 = profiles.promptAnswers[prompt2]
    ? getRandomFromArray(profiles.promptAnswers[prompt2])
    : generateGenericAnswer(prompt2);
  selectedPrompts.push({ prompt: prompt2, answer: answer2 });

  // Prompt 3
  const prompt3 = getRandomFromArray(profiles.prompts.prompt3);
  const answer3 = profiles.promptAnswers[prompt3]
    ? getRandomFromArray(profiles.promptAnswers[prompt3])
    : generateGenericAnswer(prompt3);
  selectedPrompts.push({ prompt: prompt3, answer: answer3 });

  return selectedPrompts;
}

/**
 * Génère une réponse générique pour un prompt
 */
function generateGenericAnswer(prompt) {
  const genericAnswers = [
    "Living life to the fullest",
    "Always up for an adventure",
    "Good vibes only",
    "Making memories that last",
    "Enjoying the journey",
    "Finding joy in the little things"
  ];

  return getRandomFromArray(genericAnswers);
}

/**
 * Utilitaire pour obtenir un élément aléatoire d'un tableau
 */
function getRandomFromArray(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Génère des variations dans le texte pour éviter la détection
 */
function addTextVariation(text) {
  const variations = [
    text,
    text + '!',
    text + ' :)',
    text + '...',
    text.toLowerCase(),
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
  ];

  return getRandomFromArray(variations);
}

module.exports = {
  generateProfile,
  generateBirthDate,
  generatePrompts,
  getRandomFromArray,
  addTextVariation
};