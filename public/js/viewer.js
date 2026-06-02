// 高斯泼溅3D查看器
const Viewer = {
  scene: null,
  camera: null,
  renderer: null,
  splatViewer: null,
  controls: null,
  models: {},
  currentModel: null,
  hdMode: false,

  async init(containerId) {
    const container = document.getElementById(containerId);
    const { Scene, PerspectiveCamera, WebGLRenderer, Color, Vector3, AmbientLight, GridHelper } = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

    this.scene = new Scene();
    this.scene.background = new Color(0x0a0a14);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(5, 5, 20);
    this.camera.lookAt(0, 3, 0);

    this.renderer = new WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.7;
    this.controls.update();

    this.scene.add(new AmbientLight(0x444455, 0.5));
    this.scene.add(new GridHelper(40, 40, 0x333355, 0x111122));

    await this.loadSplatLibrary();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.animate();
    return true;
  },

  async loadSplatLibrary() {
    if (window.GaussianSplats3D && window.GaussianSplats3D.Viewer) return;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.umd.min.js';
      script.onload = () => {
        resolve();
      };
      document.head.appendChild(script);
    });
  },

  async loadModel(url) {
    if (this.splatViewer) {
      this.splatViewer.dispose();
      this.splatViewer = null;
    }

    const GS3D = window.GaussianSplats3D;
    this.splatViewer = new GS3D.Viewer({
      cameraUp: [0, 1, 0],
      initialCameraPosition: [5, 5, 20],
      initialCameraLookAt: [0, 3, 0],
      sharedMemoryForWorkers: false,
      selfDrivenMode: false,
      ignoreDevicePixelRatio: false,
      gpuAcceleratedSort: true,
      renderer: this.renderer,
      camera: this.camera,
      scene: this.scene,
      controls: this.controls
    });

    try {
      await this.splatViewer.addSplatScene(url, {
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      });
      this.currentModel = url;
      return true;
    } catch (e) {
      console.error('Failed to load model:', e);
      return false;
    }
  },

  switchToHD() {
    if (this.hdMode) return;
    this.hdMode = true;
    if (this.models.hd) this.loadModel(this.models.hd);
  },

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.splatViewer && this.splatViewer.update) this.splatViewer.update();
    this.renderer.render(this.scene, this.camera);
  },

  getCameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray()
    };
  }
};
