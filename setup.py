from setuptools import setup, find_packages

setup(
    name="welian-app",
    version="1.1.0",
    description="Welian — AI companion for relationships. Be a better friend, a better family, a better you.",
    long_description="Welian helps you nurture two types of relationships: goal-driven ties (leverage) and lifelong bonds (nurture).",
    author="Welian",
    url="https://welian.app",
    license="MIT",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.9",
    install_requires=[
        "pyyaml>=6.0",
        "httpx>=0.24",
        "fastapi>=0.100",
        "uvicorn>=0.23",
        "websockets>=11.0",
    ],
    entry_points={
        "console_scripts": [
            "welian=welian.cli:main",
        ],
    },
    classifiers=[
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
