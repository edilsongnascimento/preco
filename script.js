const buscaInput = document.querySelector('#busca');
const produtosContainer = document.querySelector('#produtos');
const statusElement = document.querySelector('#status');
const abrirCameraButton = document.querySelector('#abrir-camera');
const fecharCameraButton = document.querySelector('#fechar-camera');
const cameraPanel = document.querySelector('#camera-panel');
const cameraPreview = document.querySelector('#camera-preview');
const cameraStatus = document.querySelector('#camera-status');
const instalarAppButton = document.querySelector('#instalar-app');
const installStatus = document.querySelector('#install-status');

let produtos = [];
let scannerControls = null;
let scannerAtivo = false;
let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installStatus.textContent = 'Pronto para instalar. Toque em "Instalar no Chrome".';
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installStatus.textContent = 'Aplicativo instalado com sucesso.';
});

instalarAppButton.addEventListener('click', async () => {
  if (!installPrompt) {
    installStatus.textContent = 'No Chrome, abra o menu ⋮ e selecione "Instalar app" ou "Adicionar à tela inicial".';
    return;
  }

  instalarAppButton.disabled = true;

  try {
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;

    if (outcome === 'accepted') {
      installStatus.textContent = 'Instalação iniciada.';
    } else {
      installStatus.textContent = 'Instalação cancelada. Você pode instalar depois pelo menu do Chrome.';
    }
  } catch (error) {
    installStatus.textContent = 'Não foi possível abrir a instalação. Use o menu ⋮ do Chrome para instalar.';
    console.error('Erro ao solicitar a instalação do aplicativo:', error);
  } finally {
    instalarAppButton.disabled = false;
  }
});

if (window.matchMedia('(display-mode: standalone)').matches) {
  installStatus.textContent = 'Aplicativo instalado.';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      installStatus.textContent = 'Para instalar, use o menu ⋮ do Chrome. O modo sem internet não está disponível agora.';
      console.error('Erro ao registrar o service worker:', error);
    });
  });
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

const renderProducts = (items) => {
  produtosContainer.replaceChildren();

  if (!items.length) {
    statusElement.textContent = 'Nenhum produto encontrado.';
    return;
  }

  statusElement.textContent = `${items.length} produto${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'}.`;

  items.forEach((produto) => {
    const card = document.createElement('article');
    card.className = 'product';

    const name = document.createElement('h2');
    name.textContent = produto.nome;

    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = formatCurrency(produto.preco);

    const identifiers = document.createElement('p');
    identifiers.className = 'identifiers';
    identifiers.textContent = produto.barcode
      ? `Código: ${produto.codigo} · Barras: ${produto.barcode}`
      : `Código: ${produto.codigo}`;

    card.append(name, price, identifiers);
    produtosContainer.appendChild(card);
  });
};

buscaInput.addEventListener('input', () => {
  const search = normalize(buscaInput.value);

  if (!search) {
    produtosContainer.replaceChildren();
    statusElement.textContent = `${produtos.length} produtos cadastrados. Digite para consultar um preço.`;
    return;
  }

  const buscaNumerica = /^\d+$/.test(search);
  const encontrados = produtos.filter((produto) => {
    if (buscaNumerica && search.length <= 6) {
      return normalize(produto.codigo).includes(search);
    }

    if (buscaNumerica) {
      return normalize(produto.barcode).includes(search);
    }

    return [produto.nome, produto.codigo, produto.barcode]
      .some((campo) => normalize(campo).includes(search));
  });

  renderProducts(encontrados);
});

const fecharLeitor = () => {
  scannerAtivo = false;
  scannerControls?.stop();
  scannerControls = null;
  cameraPreview.srcObject = null;
  cameraPanel.hidden = true;
  abrirCameraButton.focus();
};

const abrirLeitor = async () => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraPanel.hidden = false;
    cameraStatus.textContent = 'A câmera requer uma conexão segura (HTTPS) e um navegador compatível.';
    return;
  }

  if (!window.ZXingBrowser?.BrowserMultiFormatReader) {
    cameraPanel.hidden = false;
    cameraStatus.textContent = 'Não foi possível carregar o leitor de código de barras. Atualize a página e tente novamente.';
    return;
  }

  cameraPanel.hidden = false;
  cameraStatus.textContent = 'Aponte a câmera traseira para o código de barras.';
  scannerAtivo = true;
  const reader = new ZXingBrowser.BrowserMultiFormatReader();

  try {
    const controls = await reader.decodeFromVideoDevice(undefined, cameraPreview, (result) => {
      if (!result || !scannerAtivo) return;

      const codigo = result.getText();
      fecharLeitor();
      buscaInput.value = codigo;
      buscaInput.dispatchEvent(new Event('input', { bubbles: true }));
      buscaInput.focus();
    });

    if (scannerAtivo) {
      scannerControls = controls;
    } else {
      controls.stop();
    }
  } catch (error) {
    if (!scannerAtivo) return;

    scannerAtivo = false;
    cameraStatus.textContent = error.name === 'NotAllowedError'
      ? 'Permita o acesso à câmera nas configurações do navegador e tente novamente.'
      : error.name === 'NotFoundError'
        ? 'Nenhuma câmera foi encontrada neste dispositivo.'
        : 'Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.';
    console.error('Erro ao iniciar a leitura pela câmera:', error);
  }
};

abrirCameraButton.addEventListener('click', abrirLeitor);
fecharCameraButton.addEventListener('click', fecharLeitor);

const loadProducts = async () => {
  try {
    const response = await fetch('./produtos.json');
    if (!response.ok) {
      throw new Error(`Falha ao carregar produtos (HTTP ${response.status}).`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('O arquivo de produtos precisa conter uma lista JSON.');
    }

    produtos = data;
    statusElement.textContent = `${produtos.length} produtos cadastrados. Digite para consultar um preço.`;
  } catch (error) {
    statusElement.textContent = 'Não foi possível carregar a lista de produtos.';
    console.error('Erro ao carregar produtos:', error);
  }
};

loadProducts();
