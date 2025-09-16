# Plan de Migration vers l'Architecture Cible

## 📍 État Actuel

```
INTERFACE/
├── HINGE/           # Logique bot mélangée
├── AppiumUI/        # UI ancienne
├── electron/        # Nouveau code UI
└── Fichiers config dispersés
```

**Problèmes identifiés:**
- Couplage fort entre UI et logique métier
- Pas de séparation claire des responsabilités
- Difficile d'ajouter de nouveaux projets
- Gestion des ports/sessions fragile
- Logs non structurés

## 🎯 Architecture Cible

Une plateforme modulaire avec:
- **UI** découplée et moderne
- **Orchestrateur** central intelligent
- **Projets** isolés et pluggables
- **Infrastructure** robuste et scalable

## 📋 Étapes de Migration

### Phase 1: Préparation (Semaine 1)
**Objectif**: Stabiliser l'existant et préparer la migration

#### 1.1 Audit et Documentation
- [ ] Documenter tous les flux existants
- [ ] Identifier les dépendances critiques
- [ ] Lister les configurations nécessaires
- [ ] Créer un inventaire des fonctionnalités

#### 1.2 Mise en Place du Monorepo
```bash
# Structure initiale
mkdir -p AUTOMATION-PLATFORM/{UI,ORCHESTRATOR,PROJECTS,SHARED,INFRASTRUCTURE}
npm init -y # Root package.json
npx lerna init # Configuration Lerna
```

#### 1.3 Tests de Non-Régression
- [ ] Créer des tests pour les fonctions critiques actuelles
- [ ] Documenter les comportements attendus
- [ ] Établir une baseline de performance

### Phase 2: Extraction des Modules (Semaine 2-3)
**Objectif**: Isoler les composants réutilisables

#### 2.1 Extraction du DeviceManager
```javascript
// SHARED/libs/device-manager/
class DeviceManager {
  constructor() {
    this.devices = new Map();
    this.watcher = null;
  }

  async scan() {
    // Logique extraite de main.js
  }

  async getInfo(udid) {
    // Détails de l'appareil
  }

  watchChanges(callback) {
    // Surveillance des connexions/déconnexions
  }
}
```

#### 2.2 Extraction de l'AppiumManager
```javascript
// ORCHESTRATOR/src/drivers/AppiumDriver.js
class AppiumDriver {
  constructor(config) {
    this.servers = new Map();
    this.portAllocator = new PortAllocator();
  }

  async startServer(device) {
    const port = await this.portAllocator.allocate();
    // Démarrage Appium avec gestion d'erreurs
  }

  async createSession(device, capabilities) {
    // Création session WebDriver
  }
}
```

#### 2.3 Extraction du LogManager
```javascript
// SHARED/libs/logger/
class LogManager {
  constructor() {
    this.streams = new Map();
    this.aggregator = new LogAggregator();
  }

  addSource(name, stream) {
    // Ajout d'une source de logs
  }

  query(filters) {
    // Requête sur les logs
  }

  stream(callback) {
    // Streaming temps réel
  }
}
```

### Phase 3: Création de l'Orchestrateur (Semaine 3-4)
**Objectif**: Centraliser la coordination

#### 3.1 Core Orchestrator
```javascript
// ORCHESTRATOR/src/core/Orchestrator.js
class Orchestrator {
  constructor() {
    this.deviceManager = new DeviceManager();
    this.sessionManager = new SessionManager();
    this.projectLoader = new ProjectLoader();
    this.queue = new TaskQueue();
  }

  async executeProject(deviceId, projectName, config) {
    // Logique d'orchestration principale
    const device = await this.deviceManager.get(deviceId);
    const project = await this.projectLoader.load(projectName);
    const session = await this.sessionManager.create(device, project);

    return this.queue.enqueue({
      type: 'PROJECT_EXECUTION',
      session,
      project,
      config
    });
  }
}
```

#### 3.2 API REST
```javascript
// ORCHESTRATOR/src/api/routes.js
router.post('/devices/:id/execute', async (req, res) => {
  const { projectName, config } = req.body;
  const taskId = await orchestrator.executeProject(
    req.params.id,
    projectName,
    config
  );
  res.json({ taskId, status: 'queued' });
});
```

#### 3.3 WebSocket Events
```javascript
// ORCHESTRATOR/src/websocket/events.js
io.on('connection', (socket) => {
  // Streaming des logs
  logManager.stream((log) => {
    socket.emit('log', log);
  });

  // Updates de statut
  orchestrator.on('status', (update) => {
    socket.emit('status', update);
  });
});
```

### Phase 4: Refonte de l'UI (Semaine 4-5)
**Objectif**: Interface moderne et découplée

#### 4.1 Migration vers React/Vue
```jsx
// UI/src/renderer/App.jsx
function App() {
  const { devices, sessions } = useOrchestrator();

  return (
    <Layout>
      <Sidebar>
        <DeviceList devices={devices} />
      </Sidebar>
      <Main>
        <ControlPanel />
        <LogViewer />
        <MetricsDashboard />
      </Main>
    </Layout>
  );
}
```

#### 4.2 State Management
```javascript
// UI/src/renderer/stores/deviceStore.js
const useDeviceStore = create((set, get) => ({
  devices: new Map(),
  selectedDevice: null,

  selectDevice: (id) => set({ selectedDevice: id }),
  updateDevice: (id, data) => {
    const devices = new Map(get().devices);
    devices.set(id, { ...devices.get(id), ...data });
    set({ devices });
  }
}));
```

#### 4.3 Composants Réutilisables
```jsx
// UI/src/renderer/components/DeviceCard/index.jsx
export function DeviceCard({ device, onStart, onStop }) {
  return (
    <Card>
      <DeviceInfo {...device} />
      <DeviceStatus status={device.status} />
      <DeviceControls
        onStart={() => onStart(device.id)}
        onStop={() => onStop(device.id)}
        disabled={device.status === 'running'}
      />
      <DeviceMetrics metrics={device.metrics} />
    </Card>
  );
}
```

### Phase 5: Modularisation des Projets (Semaine 5-6)
**Objectif**: Projets pluggables et isolés

#### 5.1 Structure Standard des Projets
```javascript
// PROJECTS/HINGE/index.js
module.exports = {
  name: 'HINGE',
  version: '1.0.0',

  flows: {
    onboarding: require('./flows/onboarding'),
    accountCreation: require('./flows/account-creation'),
    interaction: require('./flows/interaction')
  },

  providers: {
    sms: require('./providers/sms'),
    email: require('./providers/email'),
    proxy: require('./providers/proxy')
  },

  config: require('./config')
};
```

#### 5.2 Interface de Projet
```javascript
// SHARED/types/IProject.js
interface IProject {
  name: string;
  version: string;

  initialize(config: ProjectConfig): Promise<void>;
  execute(session: Session, params: ExecutionParams): Promise<Result>;
  cleanup(): Promise<void>;

  flows: Map<string, IFlow>;
  providers: Map<string, IProvider>;
}
```

#### 5.3 Chargeur Dynamique
```javascript
// ORCHESTRATOR/src/core/ProjectLoader.js
class ProjectLoader {
  async load(projectName) {
    const projectPath = path.join(PROJECTS_DIR, projectName);
    const project = require(projectPath);

    // Validation
    this.validateProject(project);

    // Initialisation
    await project.initialize(this.config);

    return project;
  }
}
```

### Phase 6: Infrastructure et DevOps (Semaine 6-7)
**Objectif**: Robustesse et automatisation

#### 6.1 Scripts d'Installation
```bash
#!/bin/bash
# INFRASTRUCTURE/scripts/setup.sh

echo "🚀 Installation de la plateforme d'automatisation iOS"

# Vérification des prérequis
check_prerequisites() {
  command -v node >/dev/null 2>&1 || { echo "Node.js requis"; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "npm requis"; exit 1; }
  command -v appium >/dev/null 2>&1 || { echo "Appium requis"; exit 1; }
}

# Installation des dépendances
install_dependencies() {
  npm install
  npx lerna bootstrap
}

# Configuration initiale
initial_setup() {
  mkdir -p data/logs
  mkdir -p data/sessions
  cp config/default.json config/local.json
}

check_prerequisites
install_dependencies
initial_setup

echo "✅ Installation terminée"
```

#### 6.2 Health Checks
```javascript
// ORCHESTRATOR/src/monitoring/HealthChecker.js
class HealthChecker {
  async check() {
    const checks = await Promise.all([
      this.checkAppium(),
      this.checkDevices(),
      this.checkPorts(),
      this.checkDiskSpace()
    ]);

    return {
      healthy: checks.every(c => c.healthy),
      checks
    };
  }

  async checkAppium() {
    try {
      const response = await axios.get('http://localhost:4723/status');
      return { name: 'appium', healthy: true, details: response.data };
    } catch (error) {
      return { name: 'appium', healthy: false, error: error.message };
    }
  }
}
```

#### 6.3 CI/CD Pipeline
```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm ci
          npx lerna bootstrap

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: E2E tests
        run: npm run test:e2e
```

### Phase 7: Tests et Validation (Semaine 7-8)
**Objectif**: Assurance qualité

#### 7.1 Tests Unitaires
```javascript
// TESTS/unit/DeviceManager.test.js
describe('DeviceManager', () => {
  let deviceManager;

  beforeEach(() => {
    deviceManager = new DeviceManager();
  });

  test('should detect connected devices', async () => {
    const devices = await deviceManager.scan();
    expect(devices).toBeInstanceOf(Array);
  });

  test('should allocate unique ports', async () => {
    const port1 = await deviceManager.allocatePort();
    const port2 = await deviceManager.allocatePort();
    expect(port1).not.toBe(port2);
  });
});
```

#### 7.2 Tests d'Intégration
```javascript
// TESTS/integration/orchestrator.test.js
describe('Orchestrator Integration', () => {
  test('should execute project end-to-end', async () => {
    const orchestrator = new Orchestrator();
    const result = await orchestrator.executeProject(
      'test-device',
      'HINGE',
      { accounts: 1 }
    );

    expect(result.status).toBe('completed');
    expect(result.accounts).toBe(1);
  });
});
```

#### 7.3 Tests de Performance
```javascript
// TESTS/performance/load.test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 }, // Montée à 10 devices
    { duration: '5m', target: 10 }, // Maintien
    { duration: '2m', target: 0 },  // Descente
  ],
};

export default function() {
  let response = http.post('http://localhost:3000/execute', {
    device: 'virtual-device',
    project: 'HINGE'
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

## 📊 Critères de Succès

### Métriques Techniques
- ✅ Temps de démarrage < 5s
- ✅ Latence UI < 100ms
- ✅ Support 20+ appareils simultanés
- ✅ Recovery time < 30s après crash
- ✅ Code coverage > 80%

### Métriques Métier
- ✅ Réduction du temps de setup de 90%
- ✅ Augmentation du taux de succès de 40%
- ✅ Réduction des interventions manuelles de 75%
- ✅ Temps d'ajout d'un nouveau projet < 1h

## 🚨 Risques et Mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Breaking changes | Élevé | Moyen | Tests de régression complets |
| Performance dégradée | Moyen | Faible | Benchmarks continus |
| Complexité accrue | Moyen | Moyen | Documentation et formation |
| Résistance au changement | Faible | Moyen | Migration progressive |

## 📅 Timeline Globale

```
Semaine 1  : Préparation et audit
Semaine 2-3: Extraction des modules
Semaine 3-4: Création orchestrateur
Semaine 4-5: Refonte UI
Semaine 5-6: Modularisation projets
Semaine 6-7: Infrastructure
Semaine 7-8: Tests et validation
Semaine 8  : Déploiement progressif
```

## ✅ Checklist de Migration

### Avant de commencer
- [ ] Backup complet du code actuel
- [ ] Documentation de l'existant
- [ ] Environnement de test isolé
- [ ] Plan de rollback

### Pendant la migration
- [ ] Tests continus
- [ ] Documentation mise à jour
- [ ] Communication régulière
- [ ] Validation par étapes

### Après la migration
- [ ] Monitoring renforcé
- [ ] Formation utilisateurs
- [ ] Optimisations
- [ ] Retour d'expérience

## 🎯 Prochaines Étapes Immédiates

1. **Créer la structure de base du monorepo**
2. **Extraire le DeviceManager en module indépendant**
3. **Créer l'API REST basique de l'orchestrateur**
4. **Migrer un flow simple comme POC**
5. **Valider avec un test end-to-end**

Cette migration progressive permet de:
- Minimiser les risques
- Valider à chaque étape
- Maintenir le système opérationnel
- Apprendre et ajuster en cours de route