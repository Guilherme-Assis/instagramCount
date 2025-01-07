require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

let longLivedToken = null; // Armazena o token gerado
let tokenExpiration = null; // Timestamp da expiração do token

// Função para gerar um token de longo prazo
async function generateLongLivedToken() {
  const url = `https://graph.facebook.com/v12.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.APP_ID}&client_secret=${process.env.APP_SECRET}&fb_exchange_token=${process.env.SHORT_LIVED_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.access_token) {
      longLivedToken = data.access_token;
      tokenExpiration = Date.now() + data.expires_in * 1000; // Timestamp de expiração
      console.log('Novo token de longo prazo gerado com sucesso!');
      console.log(`Token: ${longLivedToken}`);
      console.log(`Expira em: ${data.expires_in} segundos`);
    } else {
      console.error('Erro ao gerar token:', data);
      throw new Error(data.error ? data.error.message : 'Erro desconhecido ao gerar token');
    }
  } catch (error) {
    console.error('Erro ao conectar à API do Facebook:', error.message);
  }
}

// Middleware para renovar o token automaticamente
async function ensureValidToken(req, res, next) {
  try {
    // Se o token não existe ou está prestes a expirar, gere um novo
    if (!longLivedToken || Date.now() > tokenExpiration - 7 * 24 * 60 * 60 * 1000) {
      console.log('Token ausente ou prestes a expirar. Gerando um novo...');
      await generateLongLivedToken();
    }
    next();
  } catch (error) {
    console.error('Erro ao garantir a validade do token:', error.message);
    res.status(500).json({ error: 'Erro ao garantir a validade do token' });
  }
}

// Rota para buscar o token atual
app.get('/api/token', (req, res) => {
  if (longLivedToken) {
    res.json({
      token: longLivedToken,
      expires_in: Math.floor((tokenExpiration - Date.now()) / 1000), // Tempo restante em segundos
    });
  } else {
    res.status(500).json({ error: 'Nenhum token disponível' });
  }
});

// Rota para buscar os posts
app.get('/api/posts', ensureValidToken, async (req, res) => {
  const url = `https://graph.facebook.com/v21.0/17841458442253557/media?fields=caption,media_url,permalink&limit=100&access_token=${longLivedToken}`;
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      res.json(data);
    } else {
      console.error('Erro ao buscar posts:', data);
      res.status(500).json({ error: data.error ? data.error.message : 'Erro ao buscar posts' });
    }
  } catch (error) {
    console.error('Erro ao buscar posts:', error.message);
    res.status(500).json({ error: 'Erro ao buscar posts.' });
  }
});

// Rota para buscar detalhes de um post específico
app.get('/api/comments', ensureValidToken, async (req, res) => {
  const postId = req.query.id;
  if (!postId) {
    console.error("Erro: ID do post não fornecido.");
    return res.status(400).json({ error: 'ID do post é obrigatório.' });
  }

  const url = `https://graph.facebook.com/v21.0/${postId}/comments?fields=from,text&access_token=${longLivedToken}`;
  console.log("Requisição para comentários enviada para:", url);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && Array.isArray(data.data)) {
      const mentionCounts = {};
      const userMentions = {}; // Rastreamento por usuário

      data.data.forEach(comment => {
        console.log("Comentário retornado:", comment); // Log do comentário

        if (comment.text && comment.from) {
          const userId = comment.from.id; // ID do usuário que fez o comentário
          const mentions = comment.text.match(/@\w+/g); // Extrai as menções

          if (mentions) {
            if (!userMentions[userId]) {
              userMentions[userId] = new Set(); // Inicializa o conjunto para o usuário
            }

            mentions.forEach(mention => {
              // Verifica se o usuário já mencionou este `@`
              if (!userMentions[userId].has(mention)) {
                userMentions[userId].add(mention);
                mentionCounts[mention] = (mentionCounts[mention] || 0) + 1;
              }
            });
          }
        }
      });

      // Ordenar as menções por contagem em ordem decrescente
      const sortedMentions = Object.entries(mentionCounts).sort((a, b) => b[1] - a[1]);

      // Adicionar medalhas aos três primeiros concatenando ao nome
      const medals = ['🥇', '🥈', '🥉'];
      const result = sortedMentions.map(([mention, count], index) => ({
        mention: index < 3 ? `${medals[index]} ${mention}` : mention, // Concatenar medalha ao início do nome
        count
      }));

      console.log("Menções processadas com medalhas concatenadas:", JSON.stringify(result, null, 2)); // Log das menções com medalhas concatenadas
      res.json({ mention_counts: result });
    } else {
      console.error("Erro ao buscar comentários ou estrutura inválida:", data);
      res.status(500).json({ error: data.error ? data.error.message : 'Erro ao buscar comentários' });
    }
  } catch (error) {
    console.error("Erro ao buscar comentários:", error.message);
    res.status(500).json({ error: 'Erro ao buscar comentários.' });
  }
});




app.get('/api/postDetails', ensureValidToken, async (req, res) => {
  const postId = req.query.id;
  if (!postId) {
    return res.status(400).json({ error: 'ID do post é obrigatório.' });
  }

  const url = `https://graph.facebook.com/v21.0/${postId}?fields=caption,media_url&access_token=${longLivedToken}`;
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.media_url) {
      console.log("Detalhes do post:", data); // Log dos detalhes do post
      res.json(data);
    } else {
      console.error("Erro ao buscar detalhes do post:", data);
      res.status(500).json({ error: data.error ? data.error.message : 'Erro ao buscar detalhes do post' });
    }
  } catch (error) {
    console.error("Erro ao buscar detalhes do post:", error.message);
    res.status(500).json({ error: 'Erro ao buscar detalhes do post.' });
  }
});




// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal redireciona para `/posts`
app.get('/', (req, res) => {
  res.redirect('/posts');
});

// Rota para `posts.html`
app.get('/posts', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'posts.html'));
});

// Rota para `index.html` (votação)
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log('Gerando o primeiro token de longo prazo...');
  await generateLongLivedToken(); // Gera o token inicial
});
