// People's names, and names over people in a crowd.

// Malay, English, Indian and Chinese, women and men. A Chinese name is two words, like Wen Shen or Wai Kit.
export const NAMES = [
  // Malay
  'Aisyah', 'Farid', 'Nurul', 'Hafiz', 'Siti', 'Zul', 'Aminah', 'Irfan', 'Hana', 'Amir', 'Liyana', 'Haziq', 'Syafiq', 'Izzah', 'Faiz', 'Balqis',
  'Adam', 'Mariam', 'Khairul', 'Sofea', 'Danish', 'Nadia', 'Razif', 'Husna', 'Hakim',
  // English
  'Alice', 'Daniel', 'Chloe', 'Henry', 'Grace', 'Ben', 'Emily', 'James', 'Sophie', 'Tom', 'Olivia', 'Frank', 'Lucy', 'Jack', 'Megan', 'Oscar',
  'Ruby', 'Noah', 'Ella', 'Liam', 'Hazel', 'Owen', 'Freya',
  // Indian
  'Priya', 'Arjun', 'Kavita', 'Ravi', 'Anjali', 'Vikram', 'Deepa', 'Suresh', 'Meera', 'Rahul', 'Lakshmi', 'Karthik', 'Sanjay', 'Divya', 'Anand',
  'Nisha', 'Ganesh', 'Pooja', 'Harish', 'Revathi', 'Vijay', 'Shalini', 'Kumar',
  // Chinese
  'Wen Shen', 'Wai Kit', 'Kim Wui', 'Mei Ling', 'Jia Hui', 'Wei Jie', 'Xin Yi', 'Zhi Hao', 'Li Na', 'Chun Wai', 'Siew Mei', 'Yong Sheng', 'Hui Min',
  'Jun Hao', 'Mei Xin', 'Kok Leong', 'Pei Shan', 'Boon Kiat', 'Yi Ting', 'Ah Meng', 'Su Lin', 'Kah Wai', 'Jing Yi', 'Tze Yang', 'Wan Ting',
]

// Which names over people to show so none is printed over another. Plain data in, plain
// data out. A tag says where its name would go ({ x, y } the middle of it, in screen pixels), how big the
// letters are, how wide the name is, and a rank (the lower is more wanted: the chat that is picked, then
// whoever is busy). Tags are looked at from the most wanted down; one that would touch a name already
// shown is left out. Returns the set of indexes (into `tags`) whose names are shown.
export const shownNames = tags => {
  const shown = new Set()
  const boxes = []
  tags
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => tag.width > 0)
    .sort((a, b) => a.tag.rank - b.tag.rank || a.tag.y - b.tag.y || a.tag.x - b.tag.x || a.index - b.index)
    .forEach(({ tag, index }) => {
      const box = { left: tag.x - tag.width / 2, right: tag.x + tag.width / 2, top: tag.y - tag.size / 2, bottom: tag.y + tag.size / 2 }
      if (boxes.some(o => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top)) return
      boxes.push(box)
      shown.add(index)
    })
  return shown
}
