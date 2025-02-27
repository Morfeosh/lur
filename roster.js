const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuración del bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Configuración de variables globales
let rosterChannelId = null;
const rosterFilePath = path.join(__dirname, 'roster.json');
const configFilePath = path.join(__dirname, 'config.json');

// Cargar configuración
let config = { rosterChannelId: null };
try {
  if (fs.existsSync(configFilePath)) {
    const data = fs.readFileSync(configFilePath, 'utf8');
    config = JSON.parse(data);
    rosterChannelId = config.rosterChannelId;
  }
} catch (error) {
  console.error('Error al cargar la configuración:', error);
}

// Guardar configuración
function saveConfig() {
  try {
    config.rosterChannelId = rosterChannelId;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Configuración guardada correctamente');
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
  }
}

// Cargar roster desde archivo
let roster = [];
try {
  if (fs.existsSync(rosterFilePath)) {
    const data = fs.readFileSync(rosterFilePath, 'utf8');
    roster = JSON.parse(data);
  }
} catch (error) {
  console.error('Error al cargar el roster:', error);
}

// Función para guardar roster en archivo
function saveRoster() {
  try {
    fs.writeFileSync(rosterFilePath, JSON.stringify(roster, null, 2), 'utf8');
    console.log('Roster guardado correctamente');
  } catch (error) {
    console.error('Error al guardar el roster:', error);
  }
}

// Función para limpiar el canal
async function clearChannel(channel) {
  try {
    console.log(`Iniciando limpieza del canal ${channel.name}...`);
    
    // Fetch y eliminar mensajes en bucle hasta que no queden más
    let messagesDeleted = 0;
    let messagesLeft = true;
    
    while (messagesLeft) {
      // Obtener hasta 100 mensajes (límite de Discord por consulta)
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });
      
      // Si no hay mensajes, salir del bucle
      if (fetchedMessages.size === 0) {
        messagesLeft = false;
        break;
      }
      
      // Separar mensajes recientes (menos de 14 días) para bulkDelete
      const now = Date.now();
      const twoWeeksAgo = now - 1209600000; // 14 días en milisegundos
      
      const recentMessages = fetchedMessages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
      const oldMessages = fetchedMessages.filter(msg => msg.createdTimestamp <= twoWeeksAgo);
      
      // Eliminar mensajes recientes (bulkDelete)
      if (recentMessages.size > 0) {
        await channel.bulkDelete(recentMessages);
        messagesDeleted += recentMessages.size;
        console.log(`Eliminados ${recentMessages.size} mensajes recientes`);
      }
      
      // Eliminar mensajes antiguos uno por uno
      for (const message of oldMessages.values()) {
        try {
          await message.delete();
          messagesDeleted++;
          // Pequeña pausa para evitar rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('Error al eliminar mensaje antiguo:', error);
        }
      }
      
      // Si quedan menos de 100 mensajes, es probable que hayamos eliminado todos
      if (fetchedMessages.size < 100 && oldMessages.size === 0) {
        messagesLeft = false;
      }
      
      // Pequeña pausa entre lotes para evitar rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Canal limpiado: eliminados ${messagesDeleted} mensajes`);
    return true;
  } catch (error) {
    console.error('Error al limpiar el canal:', error);
    return false;
  }
}

// Función para actualizar el roster en el canal designado
async function updateRosterDisplay() {
  if (!rosterChannelId) {
    console.log('No hay canal de roster configurado');
    return false;
  }
  
  const channel = client.channels.cache.get(rosterChannelId);
  if (!channel) {
    console.log('Canal de roster no encontrado');
    return false;
  }
  
  try {
    // Primero limpiar el canal
    await clearChannel(channel);
    
    // Luego mostrar el roster actualizado
    await displayRoster(channel);
    return true;
  } catch (error) {
    console.error('Error al actualizar el roster:', error);
    return false;
  }
}

// Función para mostrar el roster
async function displayRoster(channel) {
  if (roster.length === 0) {
    await channel.send('El roster está vacío. Añade miembros usando `/añadirmiembro`.');
    return;
  }

  // Encabezado del roster
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('📋 ROSTER DEL GREMIO 📋')
        .setDescription(`Actualizado: ${new Date().toLocaleString()}`)
        .setColor(0xF8F8FF)
    ]
  });

  // Agrupar por clase
  const groupedByClass = {
    'Tanque': [],
    'CaC DPS': [],
    'Rango DPS': [],
    'Sanador': []
  };

  roster.forEach(member => {
    if (groupedByClass[member.clase]) {
      groupedByClass[member.clase].push(member);
    } else {
      groupedByClass['Otros'] = groupedByClass['Otros'] || [];
      groupedByClass['Otros'].push(member);
    }
  });

// Crear embeds por clase
for (const [clase, miembros] of Object.entries(groupedByClass)) {
    if (miembros.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`${getEmojiForClass(clase)} ROSTER - ${clase} ${getEmojiForClass(clase)}`)
        .setColor(getColorForClass(clase))
        .setDescription(`**Total de ${miembros.length} ${clase}(s)**`)
        .setTimestamp();
  
      // Añadir miembros al embed
      miembros.forEach(member => {
        embed.addFields({
          name: `**${member.nick}**`,
          value: `**Armas:**\n- ${getEmojiForWeapon(member.arma1)} ${member.arma1}\n- ${getEmojiForWeapon(member.arma2)} ${member.arma2}`,
          inline: true
        });
      });
  
      await channel.send({ embeds: [embed] });
    }
  }

  // Pie del roster
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription('Usa `/añadirmiembro` para unirte al roster')
        .setColor(0xF8F8FF)
        .setFooter({ text: 'Gestión de Roster | Bot creado por [Draco]' })
    ]
  });
}

// Función para asignar colores según la clase
function getColorForClass(clase) {
  switch (clase) {
    case 'Tanque':
      return 0x0000FF; // Azul
    case 'CaC DPS':
      return 0xFF0000; // Rojo
    case 'Rango DPS':
      return 0x800080; // Morado
    case 'Sanador':
      return 0x00FF00; // Verde
    default:
      return 0xFFFFFF; // Blanco
  }
}

// Función para obtener emojis según la clase
function getEmojiForClass(clase) {
  switch (clase) {
    case 'Tanque':
      return '🛡️';
    case 'CaC DPS':
      return '⚔️';
    case 'Rango DPS':
      return '🏹';
    case 'Sanador':
      return '💖';
    default:
      return '🔮';
  }
}

// Función para obtener emojis según el arma
function getEmojiForWeapon(arma) {
  switch (arma) {
    case 'Espadon':
      return '🗡️';
    case 'Espada/escudo':
      return '🛡️';
    case 'Baston':
      return '🪄';
    case 'Varita':
      return '✨';
    case 'Dagas':
      return '🔪';
    case 'Arco':
      return '🏹';
    case 'Ballesta':
      return '🏹';
    case 'Lanza':
      return '🔱';
    default:
      return '🔮';
  }
}

// Registrar comandos al iniciar el bot
client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  
  try {
    // Registrar comandos
    const commands = [
      new SlashCommandBuilder()
        .setName('canalroster')
        .setDescription('Establece el canal para mostrar el roster')
        .addChannelOption(option => 
          option.setName('canal')
            .setDescription('El canal donde se mostrará el roster')
            .setRequired(true)),
            
      new SlashCommandBuilder()
        .setName('añadirmiembro')
        .setDescription('Añade un miembro al roster')
        .addStringOption(option => 
          option.setName('nick')
            .setDescription('Nickname del personaje')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('clase')
            .setDescription('Clase del personaje')
            .setRequired(true)
            .addChoices(
              { name: 'Tanque', value: 'Tanque' },
              { name: 'CaC DPS', value: 'CaC DPS' },
              { name: 'Rango DPS', value: 'Rango DPS' },
              { name: 'Sanador', value: 'Sanador' }
            ))
        .addStringOption(option => 
          option.setName('arma1')
            .setDescription('Primera arma del personaje')
            .setRequired(true)
            .addChoices(
              { name: 'Espadon', value: 'Espadon' },
              { name: 'Espada/escudo', value: 'Espada/escudo' },
              { name: 'Baston', value: 'Baston' },
              { name: 'Varita', value: 'Varita' },
              { name: 'Dagas', value: 'Dagas' },
              { name: 'Arco', value: 'Arco' },
              { name: 'Ballesta', value: 'Ballesta' },
              { name: 'Lanza', value: 'Lanza' }
            ))
        .addStringOption(option => 
          option.setName('arma2')
            .setDescription('Segunda arma del personaje')
            .setRequired(true)
            .addChoices(
              { name: 'Espadon', value: 'Espadon' },
              { name: 'Espada/escudo', value: 'Espada/escudo' },
              { name: 'Baston', value: 'Baston' },
              { name: 'Varita', value: 'Varita' },
              { name: 'Dagas', value: 'Dagas' },
              { name: 'Arco', value: 'Arco' },
              { name: 'Ballesta', value: 'Ballesta' },
              { name: 'Lanza', value: 'Lanza' }
            )),
            
      new SlashCommandBuilder()
        .setName('eliminarmiembro')
        .setDescription('Elimina un miembro del roster')
        .addStringOption(option => 
          option.setName('nick')
            .setDescription('Nickname del personaje a eliminar')
            .setRequired(true)),
            
      new SlashCommandBuilder()
        .setName('mostrarroster')
        .setDescription('Muestra el roster actual'),
        
      new SlashCommandBuilder()
        .setName('limpiarroster')
        .setDescription('Elimina todos los miembros del roster'),
        
      new SlashCommandBuilder()
        .setName('actualizarroster')
        .setDescription('Fuerza la actualización del roster en el canal configurado')
    ];

    await client.application.commands.set(commands);
    console.log('Comandos registrados correctamente');
    
    // Actualizar el roster al iniciar si hay un canal configurado
    if (rosterChannelId) {
      setTimeout(() => updateRosterDisplay(), 5000); // Esperar 5 segundos para que Discord esté listo
    }
  } catch (error) {
    console.error('Error al registrar los comandos:', error);
  }
});

// Manejar interacciones con comandos
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  // Verificar permisos de administrador para ciertos comandos
  const requiresAdmin = ['canalroster', 'limpiarroster', 'actualizarroster'].includes(commandName);
  if (requiresAdmin && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ 
      content: 'Necesitas permisos de administrador para usar este comando.', 
      ephemeral: true 
    });
  }

  try {
    switch (commandName) {
      case 'canalroster':
        const channel = interaction.options.getChannel('canal');
        rosterChannelId = channel.id;
        saveConfig();
        await interaction.reply({
          content: `Canal de roster establecido a ${channel}`,
          ephemeral: true
        });
        
        // Actualizar el roster en el nuevo canal
        updateRosterDisplay();
        break;

      case 'añadirmiembro':
        const nick = interaction.options.getString('nick');
        const clase = interaction.options.getString('clase');
        const arma1 = interaction.options.getString('arma1');
        const arma2 = interaction.options.getString('arma2');

        // Verificar si el miembro ya existe
        const existingMemberIndex = roster.findIndex(member => member.nick.toLowerCase() === nick.toLowerCase());
        
        if (existingMemberIndex !== -1) {
          // Actualizar miembro existente
          roster[existingMemberIndex] = { nick, clase, arma1, arma2 };
          await interaction.reply({ 
            content: `Miembro **${nick}** actualizado en el roster.`,
            ephemeral: true
          });
        } else {
          // Añadir nuevo miembro
          roster.push({ nick, clase, arma1, arma2 });
          await interaction.reply({ 
            content: `Miembro **${nick}** añadido al roster.`,
            ephemeral: true
          });
        }
        
        saveRoster();
        
        // Actualizar el roster en el canal configurado
        updateRosterDisplay();
        break;

      case 'eliminarmiembro':
        const nickToRemove = interaction.options.getString('nick');
        const initialLength = roster.length;
        
        roster = roster.filter(member => member.nick.toLowerCase() !== nickToRemove.toLowerCase());
        
        if (roster.length < initialLength) {
          await interaction.reply({ 
            content: `Miembro **${nickToRemove}** eliminado del roster.`,
            ephemeral: true
          });
          saveRoster();
          
          // Actualizar el roster en el canal configurado
          updateRosterDisplay();
        } else {
          await interaction.reply({ 
            content: `No se encontró ningún miembro con el nick **${nickToRemove}**.`,
            ephemeral: true
          });
        }
        break;

      case 'mostrarroster':
        if (!rosterChannelId) {
          await interaction.reply({
            content: 'No hay un canal de roster configurado. Usa `/canalroster` para configurar uno.',
            ephemeral: true
          });
        } else {
          await interaction.reply({ 
            content: `El roster está configurado para mostrarse en <#${rosterChannelId}>`,
            ephemeral: true
          });
        }
        break;

      case 'limpiarroster':
        roster = [];
        saveRoster();
        await interaction.reply({ 
          content: 'Roster limpiado completamente.',
          ephemeral: true
        });
        
        // Actualizar el roster en el canal configurado
        updateRosterDisplay();
        break;
        
      case 'actualizarroster':
        await interaction.reply({ 
          content: 'Actualizando el roster...',
          ephemeral: true
        });
        
        if (!rosterChannelId) {
          await interaction.followUp({ 
            content: 'No hay un canal de roster configurado. Usa `/canalroster` para configurar uno.',
            ephemeral: true
          });
          return;
        }
        
        const rosterChannel = client.channels.cache.get(rosterChannelId);
        if (!rosterChannel) {
          await interaction.followUp({ 
            content: 'No se pudo encontrar el canal de roster configurado. Es posible que haya sido eliminado.',
            ephemeral: true
          });
          return;
        }
        
        // Limpiar el canal y mostrar el roster
        const success = await updateRosterDisplay();
        
        if (success) {
          await interaction.followUp({ 
            content: `Roster actualizado correctamente en <#${rosterChannelId}>`,
            ephemeral: true
          });
        } else {
          await interaction.followUp({ 
            content: 'Hubo un problema al actualizar el roster. Verifica los permisos del bot.',
            ephemeral: true
          });
        }
        break;

      default:
        await interaction.reply({ 
          content: 'Comando desconocido.',
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('Error al procesar comando:', error);
    await interaction.reply({ 
      content: 'Ha ocurrido un error al procesar el comando.', 
      ephemeral: true 
    });
  }
});

// Iniciar el bot
client.login(''); // Reemplaza con tu token de Discord
