"""
Seed 50 FAANG interview questions into Firestore.

Usage:
    python seed_questions.py

Requires serviceAccountKey.json in the same directory.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
PROJECT_ID = "interview-prep-cb612"

cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred, {"projectId": PROJECT_ID})
db = firestore.client()

QUESTIONS = [
    # ── Google ──
    {"title": "Two Sum", "difficulty": "Easy", "company": "Google", "topics": ["Array", "Hash Table"], "acceptance_rate": 49.2},
    {"title": "LRU Cache", "difficulty": "Medium", "company": "Google", "topics": ["Hash Table", "Linked List"], "acceptance_rate": 42.1},
    {"title": "Word Ladder", "difficulty": "Hard", "company": "Google", "topics": ["Hash Table", "BFS"], "acceptance_rate": 38.1},
    {"title": "Median of Two Sorted Arrays", "difficulty": "Hard", "company": "Google", "topics": ["Array", "Binary Search"], "acceptance_rate": 36.5},
    {"title": "Serialize and Deserialize Binary Tree", "difficulty": "Hard", "company": "Google", "topics": ["Tree", "DFS", "BFS"], "acceptance_rate": 55.3},
    {"title": "Trapping Rain Water", "difficulty": "Hard", "company": "Google", "topics": ["Array", "Two Pointers"], "acceptance_rate": 60.7},
    {"title": "Number of Islands", "difficulty": "Medium", "company": "Google", "topics": ["Array", "DFS", "BFS"], "acceptance_rate": 58.4},
    {"title": "Course Schedule", "difficulty": "Medium", "company": "Google", "topics": ["DFS", "Topological Sort"], "acceptance_rate": 45.6},
    {"title": "Meeting Rooms II", "difficulty": "Medium", "company": "Google", "topics": ["Array", "Sorting", "Heap"], "acceptance_rate": 50.2},
    {"title": "Decode Ways", "difficulty": "Medium", "company": "Google", "topics": ["DP"], "acceptance_rate": 31.8},

    # ── Amazon ──
    {"title": "Best Time to Buy and Sell Stock", "difficulty": "Easy", "company": "Amazon", "topics": ["Array", "DP"], "acceptance_rate": 54.3},
    {"title": "Merge k Sorted Lists", "difficulty": "Hard", "company": "Amazon", "topics": ["Linked List", "Heap"], "acceptance_rate": 51.6},
    {"title": "Word Break", "difficulty": "Medium", "company": "Amazon", "topics": ["DP", "Trie"], "acceptance_rate": 45.8},
    {"title": "Rotting Oranges", "difficulty": "Medium", "company": "Amazon", "topics": ["Array", "BFS"], "acceptance_rate": 52.7},
    {"title": "Longest Substring Without Repeating Characters", "difficulty": "Medium", "company": "Amazon", "topics": ["Hash Table", "Sliding Window"], "acceptance_rate": 33.8},
    {"title": "Min Cost Climbing Stairs", "difficulty": "Easy", "company": "Amazon", "topics": ["DP"], "acceptance_rate": 61.2},
    {"title": "Maximum Subarray", "difficulty": "Medium", "company": "Amazon", "topics": ["Array", "DP"], "acceptance_rate": 49.5},
    {"title": "Copy List with Random Pointer", "difficulty": "Medium", "company": "Amazon", "topics": ["Linked List", "Hash Table"], "acceptance_rate": 54.1},
    {"title": "Critical Connections in a Network", "difficulty": "Hard", "company": "Amazon", "topics": ["DFS", "Graph"], "acceptance_rate": 59.3},
    {"title": "Reorder Data in Log Files", "difficulty": "Medium", "company": "Amazon", "topics": ["Array", "Sorting"], "acceptance_rate": 55.9},

    # ── Meta ──
    {"title": "Valid Parentheses", "difficulty": "Easy", "company": "Meta", "topics": ["Stack", "String"], "acceptance_rate": 40.7},
    {"title": "Merge Intervals", "difficulty": "Medium", "company": "Meta", "topics": ["Array", "Sorting"], "acceptance_rate": 46.2},
    {"title": "Binary Tree Right Side View", "difficulty": "Medium", "company": "Meta", "topics": ["Tree", "BFS"], "acceptance_rate": 61.3},
    {"title": "Accounts Merge", "difficulty": "Medium", "company": "Meta", "topics": ["DFS", "Union Find"], "acceptance_rate": 55.4},
    {"title": "Subarray Sum Equals K", "difficulty": "Medium", "company": "Meta", "topics": ["Array", "Hash Table"], "acceptance_rate": 43.6},
    {"title": "Minimum Window Substring", "difficulty": "Hard", "company": "Meta", "topics": ["Hash Table", "Sliding Window"], "acceptance_rate": 40.8},
    {"title": "Random Pick with Weight", "difficulty": "Medium", "company": "Meta", "topics": ["Math", "Binary Search"], "acceptance_rate": 46.5},
    {"title": "Buildings With an Ocean View", "difficulty": "Medium", "company": "Meta", "topics": ["Array", "Stack"], "acceptance_rate": 67.2},
    {"title": "Shortest Path in Binary Matrix", "difficulty": "Medium", "company": "Meta", "topics": ["Array", "BFS"], "acceptance_rate": 47.3},
    {"title": "Dot Product of Two Sparse Vectors", "difficulty": "Medium", "company": "Meta", "topics": ["Array", "Hash Table"], "acceptance_rate": 71.4},

    # ── Apple ──
    {"title": "3Sum", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Two Pointers"], "acceptance_rate": 32.4},
    {"title": "Spiral Matrix", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Simulation"], "acceptance_rate": 47.3},
    {"title": "Pascal's Triangle", "difficulty": "Easy", "company": "Apple", "topics": ["Array", "DP"], "acceptance_rate": 70.1},
    {"title": "Valid Sudoku", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Hash Table"], "acceptance_rate": 58.7},
    {"title": "First Missing Positive", "difficulty": "Hard", "company": "Apple", "topics": ["Array", "Hash Table"], "acceptance_rate": 37.9},
    {"title": "Group Anagrams", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Hash Table", "Sorting"], "acceptance_rate": 67.3},
    {"title": "Jump Game", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Greedy"], "acceptance_rate": 38.4},
    {"title": "Set Matrix Zeroes", "difficulty": "Medium", "company": "Apple", "topics": ["Array"], "acceptance_rate": 53.6},
    {"title": "Reverse Linked List", "difficulty": "Easy", "company": "Apple", "topics": ["Linked List"], "acceptance_rate": 74.2},
    {"title": "Find the Duplicate Number", "difficulty": "Medium", "company": "Apple", "topics": ["Array", "Two Pointers"], "acceptance_rate": 59.8},

    # ── Netflix ──
    {"title": "Longest Increasing Subsequence", "difficulty": "Medium", "company": "Netflix", "topics": ["DP", "Binary Search"], "acceptance_rate": 52.4},
    {"title": "Edit Distance", "difficulty": "Medium", "company": "Netflix", "topics": ["DP"], "acceptance_rate": 56.3},
    {"title": "Wildcard Matching", "difficulty": "Hard", "company": "Netflix", "topics": ["DP", "Greedy"], "acceptance_rate": 27.4},
    {"title": "Regular Expression Matching", "difficulty": "Hard", "company": "Netflix", "topics": ["DP", "Recursion"], "acceptance_rate": 28.1},
    {"title": "Burst Balloons", "difficulty": "Hard", "company": "Netflix", "topics": ["DP"], "acceptance_rate": 58.2},
    {"title": "Palindrome Partitioning", "difficulty": "Medium", "company": "Netflix", "topics": ["DP", "Backtracking"], "acceptance_rate": 67.5},
    {"title": "Unique Paths", "difficulty": "Medium", "company": "Netflix", "topics": ["DP"], "acceptance_rate": 63.4},
    {"title": "Coin Change", "difficulty": "Medium", "company": "Netflix", "topics": ["DP", "BFS"], "acceptance_rate": 43.7},
    {"title": "House Robber", "difficulty": "Medium", "company": "Netflix", "topics": ["DP"], "acceptance_rate": 49.8},
    {"title": "Maximum Product Subarray", "difficulty": "Medium", "company": "Netflix", "topics": ["DP"], "acceptance_rate": 34.6},
]


def make_slug(title: str) -> str:
    return title.lower().replace(" ", "-").replace("'", "")


def seed():
    counts: dict[str, int] = {}
    total = 0

    for q in QUESTIONS:
        slug = make_slug(q["title"])
        doc = {
            "id": slug,
            "title": q["title"],
            "difficulty": q["difficulty"],
            "company": q["company"],
            "source": "LeetCode",
            "url": f"https://leetcode.com/problems/{slug}/",
            "topics": q["topics"],
            "acceptance_rate": q["acceptance_rate"],
        }
        db.collection("questions").document(slug).set(doc)
        counts[q["company"]] = counts.get(q["company"], 0) + 1
        total += 1

    print("\n=== Seed Complete ===")
    for company, count in counts.items():
        print(f"  {company}: {count} questions")
    print(f"  Total: {total} documents written to questions/{{slug}}")


if __name__ == "__main__":
    seed()
