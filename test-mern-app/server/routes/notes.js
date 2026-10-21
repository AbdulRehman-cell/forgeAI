const router = require('express').Router()
const Note = require('../models/Note')

// GET all notes
router.get('/', async (req, res) => {
  try {
    const notes = await Note.find().sort({ createdAt: -1 })
    res.json(notes)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST create note
router.post('/', async (req, res) => {
  try {
    const note = await Note.create({
      title:   req.body.title,
      content: req.body.content,
      color:   req.body.color || '#ffffff',
    })
    res.status(201).json(note)
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

// DELETE note
router.delete('/:id', async (req, res) => {
  try {
    await Note.findByIdAndDelete(req.params.id)
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
