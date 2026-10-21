const mongoose = require('mongoose')

const NoteSchema = new mongoose.Schema({
  title:   { type: String, required: true, trim: true },
  content: { type: String, required: true },
  color:   { type: String, default: '#ffffff' },
}, { timestamps: true })

module.exports = mongoose.model('Note', NoteSchema)
