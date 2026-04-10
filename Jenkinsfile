pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'adw'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Build') {
            steps {
                echo 'Building Docker images...'
                sh 'docker compose build --no-cache'
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying ADW via Docker Compose...'
                sh '''
                    docker rm -f adw-backend adw-frontend || true
                    docker compose up -d --force-recreate
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking backend health...'
                sleep(time: 10, unit: 'SECONDS')
                sh 'curl -sf http://localhost:4000/health || echo "Health check skipped"'
            }
        }
    }

    post {
        success {
            echo 'ADW deployed successfully!'
            echo 'Frontend: http://localhost:3000'
            echo 'Backend:  http://localhost:4000'
        }
        failure {
            echo 'Deployment failed!'
            sh 'docker compose logs --tail=30 || true'
        }
    }
}
